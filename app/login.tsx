import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Svg, { Path } from "react-native-svg";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";
import { handleAuthCallback } from "../lib/auth-handler";
import { useGuest } from "./_layout";

const REVIEW_EMAIL = "review@switchifye.com";
const REVIEW_PASSWORD = process.env.EXPO_PUBLIC_REVIEW_PASSWORD ?? "";

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

function AppleLogo({ color = "#000" }: { color?: string }) {
  return (
    <Svg width={22} height={24} viewBox="0 0 170 170">
      <Path
        fill={color}
        d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.38 0-10.86 2.346-20.228 7.045-28.088 3.693-6.316 8.606-11.3 14.755-14.962 6.149-3.662 12.794-5.528 19.948-5.646 3.915 0 9.051 1.211 15.429 3.591 6.36 2.388 10.442 3.599 12.238 3.599 1.344 0 5.878-1.415 13.57-4.237 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.24 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z"
      />
    </Svg>
  );
}

function EmailIcon({ color = "#111827" }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </Svg>
  );
}

function GuestIcon({ color = "#6B7280" }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { setIsGuest } = useGuest();
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const emailInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (showEmailForm) {
      // Slight delay so the input mounts before focus
      const t = setTimeout(() => emailInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showEmailForm]);

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: "switchifye://auth/callback",
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        Alert.alert(
          "Apple Sign In Error",
          `${error.message}\n\nCode: ${error.status ?? "unknown"}`,
        );
        throw error;
      }

      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "switchifye://auth/callback",
        );

        if (result.type === "success" && result.url) {
          await handleAuthCallback(result.url);
        }
      }
    } catch (err: any) {
      const detail = err?.message ?? "Unknown error";
      Alert.alert("Apple Sign In Failed", detail);
      setMsg(detail);
    } finally {
      setAppleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "switchifye://auth/callback",
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        Alert.alert(
          "Google Sign In Error",
          `${error.message}\n\nCode: ${error.status ?? "unknown"}`,
        );
        throw error;
      }

      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "switchifye://auth/callback",
        );

        if (result.type === "success" && result.url) {
          await handleAuthCallback(result.url);
        }
      }
    } catch (err: any) {
      const detail = err?.message ?? "Unknown error";
      Alert.alert("Google Sign In Failed", detail);
      setMsg(detail);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email.trim()) return;
    setEmailLoading(true);
    setMsg(null);

    try {
      if (email.trim().toLowerCase() === REVIEW_EMAIL) {
        const { error } = await supabase.auth.signInWithPassword({
          email: REVIEW_EMAIL,
          password: REVIEW_PASSWORD,
        });
        if (error) throw error;
        return;
      }

      console.log(`[magic-link] URL: ${SUPABASE_URL}`);
      console.log(
        `[magic-link] ANON_KEY: ${SUPABASE_ANON_KEY.slice(0, 50)}...`,
      );

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: "switchifye://auth/callback",
        },
      });

      if (error) {
        throw error;
      }
      setEmailSent(true);
    } catch (err: any) {
      const detail = err?.message ?? "Unknown error";
      setMsg(detail);
    } finally {
      setEmailLoading(false);
    }
  };

  const anyLoading = appleLoading || googleLoading || emailLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require("../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={styles.title}>Welcome to Switchifye</Text>
          <Text style={styles.subtitle}>
            Sign in to access your dashboard
          </Text>
        </View>

        {/* Auth buttons */}
        <View style={styles.authSection}>
          {/* Sign in with Apple */}
          <TouchableOpacity
            style={styles.authButton}
            onPress={handleAppleSignIn}
            disabled={anyLoading}
            activeOpacity={0.8}
          >
            {appleLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <AppleLogo color="#000" />
                <Text style={styles.authButtonText}>Sign in with Apple</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Sign in with Google */}
          <TouchableOpacity
            style={styles.authButton}
            onPress={handleGoogleSignIn}
            disabled={anyLoading}
            activeOpacity={0.8}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#111827" />
            ) : (
              <>
                <GoogleLogo />
                <Text style={styles.authButtonText}>Sign in with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          {emailSent ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                Check your email for a login link.
              </Text>
            </View>
          ) : !showEmailForm ? (
            <TouchableOpacity
              style={styles.authButton}
              onPress={() => setShowEmailForm(true)}
              disabled={anyLoading}
              activeOpacity={0.8}
            >
              <EmailIcon color="#111827" />
              <Text style={styles.authButtonText}>Continue with Email</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.emailForm}>
              <TextInput
                ref={emailInputRef}
                style={styles.emailInput}
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                editable={!anyLoading}
                returnKeyType="go"
                onSubmitEditing={handleEmailSignIn}
              />
              <TouchableOpacity
                onPress={handleEmailSignIn}
                disabled={anyLoading || !email.trim()}
                activeOpacity={0.8}
                style={[
                  styles.emailSubmitButton,
                  !email.trim() && styles.emailButtonDisabled,
                ]}
              >
                {emailLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.emailSubmitText}>
                    Email Me a Login Link
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Error message */}
          {msg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{msg}</Text>
            </View>
          )}

          {/* Continue as guest */}
          <TouchableOpacity
            onPress={() => {
              setIsGuest(true);
              router.replace("/");
            }}
            disabled={anyLoading}
            activeOpacity={0.8}
            style={styles.guestButton}
          >
            <GuestIcon color="#4B5563" />
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By signing in, you agree to our{" "}
            <Text
              style={styles.footerLink}
              onPress={() => Linking.openURL("https://switchifye.com/terms")}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={styles.footerLink}
              onPress={() => Linking.openURL("https://switchifye.com/privacy")}
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    width: 160,
    height: 40,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0A0F1C",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
  },
  authSection: {
    gap: 12,
  },
  authButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  authButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    color: "#9CA3AF",
    fontSize: 14,
    marginHorizontal: 16,
  },
  emailForm: {
    gap: 10,
  },
  emailInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: "#111827",
  },
  emailSubmitButton: {
    backgroundColor: "#0A0F1C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emailButtonDisabled: {
    opacity: 0.4,
  },
  emailSubmitText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  successBox: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#6EE7B7",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  successText: {
    fontSize: 15,
    color: "#047857",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#B91C1C",
    textAlign: "center",
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 16,
  },
  guestButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#4B5563",
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
  },
  footerLink: {
    color: "#6B7280",
    textDecorationLine: "underline",
  },
});
