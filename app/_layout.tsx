import { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";
import { handleAuthCallback } from "../lib/auth-handler";
import type { Session } from "@supabase/supabase-js";

type SubStatus = "loading" | "active" | "needs_paywall";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [subStatus, setSubStatus] = useState<SubStatus>("loading");
  const router = useRouter();
  const segments = useSegments();

  const checkSubscription = useCallback(async (s: Session) => {
    setSubStatus("loading");
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${s.user.id}&select=plan_id,status,stripe_subscription_id`,
        {
          headers: {
            Authorization: `Bearer ${s.access_token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        },
      );

      if (!res.ok) {
        setSubStatus("needs_paywall");
        return;
      }

      const rows = await res.json();

      if (rows.length === 0) {
        // No subscription row — needs paywall
        setSubStatus("needs_paywall");
        return;
      }

      const sub = rows[0];

      const hasAccess =
        sub.status === "active" ||
        sub.status === "grace_period" ||
        sub.status === "billing_retry";

      // If user has an active Stripe subscription (any paid plan), skip paywall
      if (
        sub.stripe_subscription_id &&
        sub.plan_id !== "free" &&
        hasAccess
      ) {
        setSubStatus("active");
        return;
      }

      // plan_id is free or no active sub — show paywall
      if (sub.plan_id === "free" || !sub.plan_id) {
        setSubStatus("needs_paywall");
        return;
      }

      // Any other paid plan with access (e.g. Apple IAP, including grace period)
      if (hasAccess) {
        setSubStatus("active");
        return;
      }

      setSubStatus("needs_paywall");
    } catch (err) {
      console.error("[layout] Subscription check failed:", err);
      setSubStatus("needs_paywall");
    }
  }, []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        checkSubscription(data.session);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          checkSubscription(newSession);
        } else {
          setSubStatus("loading");
        }
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
  }, [checkSubscription]);

  // Redirect based on auth + subscription state
  useEffect(() => {
    if (session === undefined) return; // still loading

    const currentSegment = segments[0];
    const onLoginScreen = currentSegment === "login";
    const onPaywall = currentSegment === "paywall";

    if (!session) {
      // Not logged in — go to login
      if (!onLoginScreen) {
        router.replace("/login");
      }
    } else if (subStatus === "loading") {
      // Still checking subscription — stay put
      return;
    } else if (subStatus === "needs_paywall") {
      // Logged in but no active sub — show paywall
      if (!onPaywall) {
        router.replace("/paywall");
      }
    } else {
      // Active subscription — go to dashboard
      if (onLoginScreen || onPaywall) {
        router.replace("/");
      }
    }
  }, [session, subStatus, segments]);

  // Show loading spinner while checking auth
  if (session === undefined || (session && subStatus === "loading")) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#3EEBBE" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
      </Stack>
    </>
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
