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
} from "react-native";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";
import { buildInjectSessionJS } from "../lib/session";

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
