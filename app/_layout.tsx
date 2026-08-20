import { createContext, useContext, useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import { handleAuthCallback } from "../lib/auth-handler";
import { configureRevenueCat, signOutRevenueCat } from "../lib/revenuecat";
import type { Session } from "@supabase/supabase-js";

type GuestContextType = {
  isGuest: boolean;
  setIsGuest: (value: boolean) => void;
};

const GuestContext = createContext<GuestContextType>({
  isGuest: false,
  setIsGuest: () => {},
});

export function useGuest() {
  return useContext(GuestContext);
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isGuest, setIsGuest] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Check initial session and validate token server-side
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        // Validate the token is still valid (catches deleted accounts)
        const { error } = await supabase.auth.getUser(data.session.access_token);
        if (error) {
          // Token is stale (e.g. account was deleted) — clear it
          await supabase.auth.signOut();
          setSession(null);
          return;
        }
        setSession(data.session);
      } else {
        setSession(null);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    // Handle deep link if the app was opened by one
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthCallback(url);
    });

    // Listen for deep links while the app is running
    const linkSub = Linking.addEventListener("url", (event) => {
      handleAuthCallback(event.url);
    });

    return () => {
      listener.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  // RevenueCat identity — ANDROID ONLY. iOS never configures this SDK; it stays
  // on react-native-iap.
  //
  // Configured only once a session has RESOLVED, never anonymously. RevenueCat's
  // app_user_id must be the Supabase user id, because it is the only thing tying
  // a Play purchase back to a user row — the webhook rejects anonymous
  // ($RCAnonymousID:...) ids precisely so an unattributable purchase can never
  // be written. Configuring before the session lands would produce exactly those.
  //
  // This runs off `session`, which is the same value the redirect effect below
  // uses, so login and logout are both covered by one subscription:
  // configureRevenueCat re-identifies if the SDK is already running, and signing
  // out calls logOut — required, or the SDK keeps the previous app_user_id and
  // the next account on this device inherits its entitlements.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (session === undefined) return; // still resolving — do nothing yet

    if (session?.user?.id) {
      configureRevenueCat(session.user.id);
    } else {
      signOutRevenueCat();
    }
  }, [session]);

  // Redirect based on auth state only (no paywall gating)
  useEffect(() => {
    if (session === undefined) return; // still loading

    const onLoginScreen = segments[0] === "login";
    const onExploreScreen = segments[0] === "explore";

    if (!session && !isGuest && !onLoginScreen && !onExploreScreen) {
      router.replace("/login");
    } else if (session && onLoginScreen) {
      setIsGuest(false);
      router.replace("/");
    }
  }, [session, isGuest, segments]);

  // Show loading spinner while checking auth
  if (session === undefined) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#3EEBBE" />
      </View>
    );
  }

  return (
    <GuestContext.Provider value={{ isGuest, setIsGuest }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="explore" />
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
      </Stack>
    </GuestContext.Provider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: "#0A0F1C",
    alignItems: "center",
    justifyContent: "center",
  },
});
