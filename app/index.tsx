import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Image,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Platform,
} from "react-native";
// SafeAreaView from react-native-safe-area-context, NOT from react-native.
// React Native's own SafeAreaView is iOS-only — on Android it renders as a
// plain View and applies no insets at all, which is why the WebView drew
// under the status bar there while iOS looked correct.
//
// This one is backed by a native view that reads the real window insets on
// both platforms. Default edges are all four, applied additively over the
// view's own padding — on iOS that resolves to exactly the padding RN's
// SafeAreaView was already applying, so iOS rendering is unchanged.
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";
import { buildInjectSessionJS, getAccessToken } from "../lib/session";
import { useGuest } from "./_layout";

// shouldShowAlert is deprecated and no longer satisfies NotificationBehavior;
// it split into shouldShowBanner (the heads-up peek) and shouldShowList (the
// notification tray/centre entry). Both are required, so setting only the old
// field left this call permanently failing typecheck.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const DASHBOARD_URL = "https://app.switchifye.com/dashboard";
const CONTACTS_URL = "https://app.switchifye.com/dashboard/contacts";
const FILES_URL = "https://app.switchifye.com/dashboard/files";
const MESSAGES_URL = "https://app.switchifye.com/dashboard/messages";

// Everything the WebView is allowed to navigate to in-place. Anything else —
// notably the signed Supabase Storage download links on the Messages page —
// gets handed off to the system browser instead (see onShouldStartLoadWithRequest).
const APP_HOST = "app.switchifye.com";

const HIDE_HEADER_JS = `
  (function() {
    const style = document.createElement('style');
    style.textContent = \`
      header, nav, .navbar, [class*="header"], [class*="nav-bar"], [id*="header"] {
        display: none !important;
      }
    \`;
    document.head.appendChild(style);
  })();
  true;
`;

// Android routes every notification through a channel. The id here must match
// the `defaultChannel` in app.json's expo-notifications plugin config — that is
// what the server's pushes resolve to, since the send payload deliberately
// carries no channelId (an unknown channelId is dropped silently by Android).
const CHECKIN_CHANNEL_ID = "checkin-reminders";

// Created on every launch — the call is idempotent — and deliberately NOT
// gated on notification permission: the channel has to exist for delivery to
// resolve, whether or not POST_NOTIFICATIONS has been granted yet.
//
// IMPORTANCE IS FIXED AT CREATION. Android will not let the app raise it
// later; only the user can, in system settings. HIGH is deliberate and must
// be right the first time — check-in reminders are time-critical, and at
// DEFAULT they would not peek as a heads-up notification. Changing this later
// means shipping a new channel id and orphaning the old one.
async function setupAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHECKIN_CHANNEL_ID, {
    name: "Check-in reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
  });
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}

export const webViewRef = { current: null as any };

type NavTab = "dashboard" | "contacts" | "files" | "messages";

const NAV_URLS: Record<NavTab, string> = {
  dashboard: DASHBOARD_URL,
  contacts: CONTACTS_URL,
  files: FILES_URL,
  messages: MESSAGES_URL,
};

// A menu row is EITHER a web destination (loaded in the WebView via navigateTo)
// OR a native action — never a bare URL. This union is a compliance guard, not
// a style choice:
//
// Settings must stay NATIVE (router.push("/settings") → native settings →
// native /paywall → StoreKit IAP). Pointing it at a web /dashboard/settings
// route would load Stripe billing surfaces inside the WebView — precisely the
// App Store 3.1.1 violation the native screen exists to prevent.
//
// Because a row can only carry `tab: NavTab` (a key into NAV_URLS) or an
// `onPress`, there is no way to express "Settings → some URL" here. Keep it
// that way: do NOT add a `url` field to this type.
type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
} & ({ tab: NavTab; onPress?: never } | { onPress: () => void; tab?: never });

export default function HomeScreen() {
  const router = useRouter();
  const { isGuest, setIsGuest } = useGuest();
  const localWebViewRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [currentUrl, setCurrentUrl] = useState(DASHBOARD_URL);
  const [showNav, setShowNav] = useState(false);

  // Unread Messages count for the in-app header badge.
  //
  // This is IN-APP ONLY and deliberately has nothing to do with the OS app-icon
  // badge or expo-notifications above — that machinery belongs to the check-in
  // reminder system and stays separate. Never route this count through
  // setBadgeCountAsync.
  const [messageCount, setMessageCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const pushTokenRef = useRef<string | null>(null);
  const pushTokenSaved = useRef(false);
  // In-memory only, per the "persist nothing new" constraint: it just stops
  // onLoadEnd re-running registration on every subsequent page load.
  const pushRegisterStarted = useRef(false);
  const retryCount = useRef(0);
  const MAX_RETRIES = 5;

  const savePushToken = async () => {
    const token = pushTokenRef.current;
    if (!token || pushTokenSaved.current) return;

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      const res = await fetch("https://app.switchifye.com/api/user/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ push_token: token }),
      });

      if (res.ok) {
        pushTokenSaved.current = true;
      } else if (retryCount.current < MAX_RETRIES) {
        retryCount.current += 1;
        setTimeout(savePushToken, 3000 * retryCount.current);
      }
    } catch {
      if (retryCount.current < MAX_RETRIES) {
        retryCount.current += 1;
        setTimeout(savePushToken, 3000 * retryCount.current);
      }
    }
  };

  // Same call the web header makes. Fails silent in every direction: no token,
  // failed request, or malformed body leaves the count at 0, which renders no
  // badge at all. It must never throw or block the header.
  const refreshMessageCount = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch(
        "https://app.switchifye.com/api/messages?count=1",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const json = await res.json();
      if (typeof json?.count === "number") setMessageCount(json.count);
    } catch {
      // no badge
    }
  };

  const handleWebViewMessage = (_event: any) => {
    // Reserved for future WebView → native messaging
  };

  useEffect(() => {
    // No-op on iOS. Runs regardless of permission state — see the function.
    setupAndroidNotificationChannel();

    // Push registration is NOT here. It used to be, which meant the OS
    // permission prompt fired on mount — including for guests, who have no
    // account and nothing to be reminded about. On Android 13+ that spends the
    // one realistic POST_NOTIFICATIONS ask at the worst possible moment: a
    // second denial is treated as "don't ask again". It now fires from the
    // WebView's onLoadEnd instead, which only the authenticated branch renders.

    // Baseline in-app badge fetch on mount.
    refreshMessageCount();

    // Refresh dashboard and clear badge when app comes to foreground
    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        Notifications.setBadgeCountAsync(0);

        // In-app Messages badge — piggybacks on the listener that already
        // exists. Unrelated to setBadgeCountAsync above, which is the OS badge.
        refreshMessageCount();

        // The WebView reloads just below; a menu left floating over a reloading
        // page is a bad state to come back to.
        setMenuOpen(false);

        localWebViewRef.current?.injectJavaScript(`
          (function() {
            if (window.location.href.indexOf('/dashboard') !== -1
                && window.location.href.indexOf('/dashboard/') === -1) {
              window.location.reload();
            } else {
              window.dispatchEvent(new CustomEvent('switchifye-app-focus'));
            }
          })();
          true;
        `);
      }
      appState.current = nextState;
    });

    // Clear badge when notification is tapped
    const notifSub = Notifications.addNotificationResponseReceivedListener(() => {
      Notifications.setBadgeCountAsync(0);
    });

    return () => {
      appStateSub.remove();
      notifSub.remove();
    };
  }, []);

  const navigateTo = (tab: NavTab) => {
    const url = NAV_URLS[tab];
    setActiveTab(tab);
    setCurrentUrl(url);
    localWebViewRef.current?.injectJavaScript(
      `window.location.href = '${url}'; true;`
    );
  };

  // Dashboard / Contacts / Files are web routes → WebView.
  // Settings is native → router.push. See the MenuItem type for why.
  const menuItems: MenuItem[] = [
    { key: "dashboard", label: "Dashboard", icon: "home-outline", tab: "dashboard" },
    { key: "contacts", label: "Contacts", icon: "people-outline", tab: "contacts" },
    { key: "files", label: "Files", icon: "document-text-outline", tab: "files" },
    {
      key: "settings",
      label: "Settings",
      icon: "settings-outline",
      onPress: () => router.push("/settings"),
    },
  ];

  const handleMenuPress = (item: MenuItem) => {
    if (item.tab) {
      navigateTo(item.tab);
    } else {
      item.onPress();
    }
    setMenuOpen(false);
  };

  const [guestTab, setGuestTab] = useState<NavTab>("dashboard");

  const goToLogin = () => {
    setIsGuest(false);
    router.replace("/login");
  };

  const handleNewSwitch = () => {
    Alert.alert(
      "Account Required",
      "Create a free account to make your first switch",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Up", onPress: goToLogin },
      ],
    );
  };

  const nowFormatted = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (isGuest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {/* Header — same as authenticated */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setGuestTab("dashboard")}
            activeOpacity={0.8}
            style={styles.logoWrap}
          >
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setGuestTab("contacts")}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people-outline"
              size={20}
              color={guestTab === "contacts" ? "#3EEBBE" : "rgba(255,255,255,0.5)"}
            />
            <Text style={[
              styles.navButtonText,
              guestTab === "contacts" && styles.navButtonTextActive,
            ]}>
              Contacts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={styles.settingsButton}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {guestTab === "dashboard" ? (
          <ScrollView style={g.scroll} contentContainerStyle={g.scrollContent}>
            {/* Title */}
            <Text style={g.pageTitle}>Dashboard</Text>
            <Text style={g.pageSubtitle}>Manage your switches and check-ins</Text>

            {/* New Switch button */}
            <TouchableOpacity
              style={g.newSwitchBtn}
              onPress={handleNewSwitch}
              activeOpacity={0.8}
            >
              <Text style={g.newSwitchText}>+ New Switch</Text>
            </TouchableOpacity>

            {/* 2x2 stat grid */}
            <View style={g.statGrid}>
              <View style={g.statCard}>
                <View style={g.statIconWrap}>
                  <Ionicons name="flash" size={16} color="#14b8a6" />
                </View>
                <Text style={g.statLabel}>Active</Text>
                <Text style={g.statValue}>0</Text>
              </View>
              <View style={g.statCard}>
                <View style={g.statIconWrap}>
                  <Ionicons name="close-circle-outline" size={16} color="#9ca3af" />
                </View>
                <Text style={g.statLabel}>Inactive</Text>
                <Text style={g.statValue}>0</Text>
              </View>
              <View style={g.statCard}>
                <View style={g.statIconWrap}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" />
                </View>
                <Text style={g.statLabel}>Completed</Text>
                <Text style={g.statValue}>0</Text>
              </View>
              <View style={g.statCard}>
                <View style={g.statIconWrap}>
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                </View>
                <Text style={g.statLabel}>Last Check-in</Text>
                <Text style={[g.statValue, { fontSize: 13 }]}>{nowFormatted}</Text>
                <Text style={g.statTz}>{tzName}</Text>
              </View>
            </View>

            {/* Active Switches section */}
            <View style={g.sectionHeader}>
              <Ionicons name="flash" size={16} color="#14b8a6" />
              <Text style={g.sectionTitle}>Active Switches</Text>
              <View style={g.badge}>
                <Text style={g.badgeText}>0</Text>
              </View>
            </View>

            {/* Empty state */}
            <View style={g.emptyCard}>
              <Ionicons name="shield-outline" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={g.emptyText}>Create an account to make your first switch</Text>
              <TouchableOpacity onPress={goToLogin} activeOpacity={0.8}>
                <LinearGradient
                  colors={["#4A9FF5", "#3EEBBE"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={g.ctaBtn}
                >
                  <Text style={g.ctaText}>Create Free Account</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          /* Contacts tab */
          <View style={g.contactsEmpty}>
            <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={g.emptyText}>Create an account to add contacts</Text>
            <TouchableOpacity onPress={goToLogin} activeOpacity={0.8}>
              <LinearGradient
                colors={["#4A9FF5", "#3EEBBE"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={g.ctaBtn}
              >
                <Text style={g.ctaText}>Create Free Account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Native Header */}
      <View style={styles.header}>

        {/* Logo — taps to dashboard */}
        <TouchableOpacity
          onPress={() => navigateTo("dashboard")}
          activeOpacity={0.8}
          style={styles.logoWrap}
        >
          <Image
            source={require("../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {/* Right cluster: Messages ✉️ then the hamburger ☰. Contacts, Files,
            Dashboard and Settings all live inside the menu now. */}
        {showNav ? (
          <View style={styles.rightGroup}>
            <TouchableOpacity
              onPress={() => navigateTo("messages")}
              style={styles.iconButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel="Messages"
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={activeTab === "messages" ? "#3EEBBE" : "rgba(255,255,255,0.5)"}
              />

              {/* In-app badge only. Never the OS app-icon badge. */}
              {messageCount > 0 && (
                <LinearGradient
                  colors={["#4A9FF5", "#3EEBBE"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.countBadge}
                >
                  <Text style={styles.countBadgeText}>
                    {messageCount > 9 ? "9+" : messageCount}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMenuOpen((open) => !open)}
              style={styles.iconButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel={menuOpen ? "Close menu" : "Open menu"}
            >
              <Ionicons
                name={menuOpen ? "close-outline" : "menu-outline"}
                size={20}
                color="rgba(255,255,255,0.5)"
              />
            </TouchableOpacity>
          </View>
        ) : (
          // Spacer keeps the logo from re-centering when the nav is hidden.
          // Still balancing TWO icons (envelope + hamburger).
          <View style={{ width: 72 }} />
        )}

      </View>

      {/* Nav menu.
          <Modal> and not an absolutely-positioned overlay: the WebView is a
          native view and will paint over JS-layer siblings whatever their
          zIndex. Modal renders in its own native window, above everything. */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        {/* Backdrop — tap anywhere outside the panel to dismiss. */}
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          {/* Stop taps on the panel itself from bubbling to the backdrop. */}
          <Pressable style={styles.menuPanel} onPress={() => {}}>
            {menuItems.map((item) => {
              // Settings has no tab, so it never highlights — correct: it isn't
              // a WebView destination and `activeTab` doesn't track it.
              const active = item.tab !== undefined && item.tab === activeTab;

              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => handleMenuPress(item)}
                  style={styles.menuRow}
                  activeOpacity={0.7}
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={active ? "#3EEBBE" : "rgba(255,255,255,0.5)"}
                  />
                  <Text
                    style={[styles.menuRowText, active && styles.menuRowTextActive]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <WebView
        ref={(ref) => {
          localWebViewRef.current = ref;
          webViewRef.current = ref;
        }}
        source={{ uri: currentUrl }}
        style={styles.webview}
        sharedCookiesEnabled={true}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        // The token is how the web app tells an app session from a browser one.
        // The iOS string is byte-identical to what shipped before; Android gets
        // a distinct token so it stops being attributed as iOS. The two are
        // disjoint under the web regexes — "SwitchifyeAndroid/1.0" contains no
        // "Switchifye/" substring. Do not drop " Safari" from the base string:
        // the web fallback check keys on its absence to spot generic iOS WebViews.
        userAgent={
          Platform.OS === "android"
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 SwitchifyeAndroid/1.0"
            : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 Switchifye/1.0"
        }
        onLoadEnd={async () => {
          localWebViewRef.current?.injectJavaScript(HIDE_HEADER_JS);

          // Inject native session into WebView so the dashboard recognizes the user
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            const js = buildInjectSessionJS(data.session);
            localWebViewRef.current?.injectJavaScript(js);
          }

          // Ask for notification permission only once the authenticated
          // dashboard has actually loaded. The guest branch never renders this
          // WebView, so guests are never prompted.
          if (!pushRegisterStarted.current) {
            pushRegisterStarted.current = true;
            const token = await registerForPushNotifications();
            if (token) pushTokenRef.current = token;
          }

          savePushToken();
        }}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url ?? "";

          // Anything on our own host (plus about:blank / data: bootstraps) loads
          // in the WebView exactly as before. Normal navigation is untouched.
          if (
            !/^https?:\/\//i.test(url) ||
            url.includes(APP_HOST)
          ) {
            return true;
          }

          // Everything else is off-host — in practice the signed Supabase
          // Storage links on the Messages page, which respond with
          // Content-Disposition: attachment. WKWebView does nothing visible with
          // those, so hand them to the system browser, which can present and
          // save the file. Cancel the in-WebView load.
          WebBrowser.openBrowserAsync(url).catch(() => {
            // If the browser can't open it, we've already cancelled the WebView
            // load — nothing further to do but not crash.
          });
          return false;
        }}
        onNavigationStateChange={(navState) => {
          const url = navState.url ?? '';
          setShowNav(url.includes('/dashboard'));

          // Keep the badge honest after the user acts on the Messages page
          // (opening a message auto-reads it, which decrements the count).
          if (url.includes("/dashboard/messages")) {
            refreshMessageCount();
          }
        }}
        onMessage={handleWebViewMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0F1C",
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#0A0F1C",
  },
  logoWrap: {
    height: 52,
    justifyContent: "center",
  },
  logo: {
    width: 110,
    height: 28,
  },
  // NOTE: navButton / navButtonText / navButtonTextActive / settingsButton are
  // still used by the GUEST header below — they are not dead. Only the
  // authenticated header's center nav group was removed.
  navButton: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  navButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
  },
  navButtonTextActive: {
    color: "#3EEBBE",
  },
  settingsButton: {
    height: 52,
    width: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // 44x44 tap target (the icon is only 20pt), so the envelope and the gear
  // aren't fat-finger-adjacent. hitSlop on each widens it further.
  iconButton: {
    height: 44,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    position: "absolute",
    top: 4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  // Anchored under the header, hard right — reads as dropping out of the
  // hamburger. Top offset clears the status bar + the 52pt header.
  menuPanel: {
    position: "absolute",
    top: 100,
    right: 12,
    minWidth: 190,
    backgroundColor: "#141B2D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
  },
  menuRowTextActive: {
    color: "#3EEBBE",
  },
  webview: {
    flex: 1,
  },
});

const g = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  newSwitchBtn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  newSwitchText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    width: "48.5%" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  statTz: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  badge: {
    backgroundColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  emptyCard: {
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.08)",
    borderStyle: "dashed",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  emptyText: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 20,
    lineHeight: 22,
  },
  ctaBtn: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  contactsEmpty: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
});
