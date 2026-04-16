import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  AppState,
  AppStateStatus,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";
import { buildInjectSessionJS } from "../lib/session";
import { useGuest } from "./_layout";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const DASHBOARD_URL = "https://app.switchifye.com/dashboard";
const CONTACTS_URL = "https://app.switchifye.com/dashboard/contacts";

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

type NavTab = "dashboard" | "contacts";

export default function HomeScreen() {
  const router = useRouter();
  const { isGuest, setIsGuest } = useGuest();
  const localWebViewRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [currentUrl, setCurrentUrl] = useState(DASHBOARD_URL);
  const [showNav, setShowNav] = useState(false);

  const pushTokenRef = useRef<string | null>(null);
  const pushTokenSaved = useRef(false);
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

  const handleWebViewMessage = (_event: any) => {
    // Reserved for future WebView → native messaging
  };

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) {
        pushTokenRef.current = token;
        // Token will be saved when WebView finishes loading (see onLoadEnd)
      }
    });

    // Refresh dashboard and clear badge when app comes to foreground
    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        Notifications.setBadgeCountAsync(0);
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
    const url = tab === "dashboard" ? DASHBOARD_URL : CONTACTS_URL;
    setActiveTab(tab);
    setCurrentUrl(url);
    localWebViewRef.current?.injectJavaScript(
      `window.location.href = '${url}'; true;`
    );
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

        {/* Contacts nav button */}
        {showNav && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigateTo("contacts")}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people-outline"
              size={20}
              color={activeTab === "contacts" ? "#3EEBBE" : "rgba(255,255,255,0.5)"}
            />
            <Text style={[
              styles.navButtonText,
              activeTab === "contacts" && styles.navButtonTextActive
            ]}>
              Contacts
            </Text>
          </TouchableOpacity>
        )}

        {/* Settings */}
        {showNav ? (
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={styles.settingsButton}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

      </View>

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
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        onLoadEnd={async () => {
          localWebViewRef.current?.injectJavaScript(HIDE_HEADER_JS);

          // Inject native session into WebView so the dashboard recognizes the user
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            const js = buildInjectSessionJS(data.session);
            localWebViewRef.current?.injectJavaScript(js);
          }

          savePushToken();
        }}
        onNavigationStateChange={(navState) => {
          const url = navState.url ?? '';
          setShowNav(url.includes('/dashboard'));
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
  navButton: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  navButtonText: {
    fontSize: 14,
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
