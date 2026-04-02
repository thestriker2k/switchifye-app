import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import { handleAuthCallback } from "../lib/auth-handler";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
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

  // Redirect based on auth state only (no paywall gating)
  useEffect(() => {
    if (session === undefined) return; // still loading

    const onLoginScreen = segments[0] === "login";

    if (!session && !onLoginScreen) {
      router.replace("/login");
    } else if (session && onLoginScreen) {
      router.replace("/");
    }
  }, [session, segments]);

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
