import { useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";
import { handleAuthCallback } from "../lib/auth-handler";

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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [googleLoading, setGoogleLoading] = useState(false);

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
            Sign in to manage your safety switches
          </Text>
        </View>

        {/* Auth buttons */}
        <View style={styles.authSection}>
          {/* Sign in with Apple */}
          <TouchableOpacity
            style={styles.appleButton}
            onPress={handleAppleSignIn}
            disabled={anyLoading}
            activeOpacity={0.8}
          >
            {appleLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.appleIcon}>{"\uF8FF"}</Text>
                <Text style={styles.appleButtonText}>Sign in with Apple</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Sign in with Google */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={anyLoading}
            activeOpacity={0.8}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <GoogleLogo />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Magic link */}
          {emailSent ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                Check your email for a login link.
              </Text>
            </View>
          ) : (
            <View style={styles.emailForm}>
              <TextInput
                style={styles.emailInput}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.8)"
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
                style={!email.trim() ? styles.emailButtonDisabled : undefined}
              >
                <LinearGradient
                  colors={["#4A9FF5", "#3EEBBE"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.emailButton}
                >
                  {emailLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.emailButtonText}>
                      Continue with Email
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Error message */}
          {msg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{msg}</Text>
            </View>
          )}
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
    backgroundColor: "#0A0F1C",
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
    color: "#fff",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.5)",
  },
  authSection: {
    gap: 12,
  },
  appleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  appleIcon: {
    fontSize: 20,
    color: "#000",
    fontFamily: Platform.OS === "ios" ? "System" : undefined,
  },
  appleButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  dividerText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    marginHorizontal: 16,
  },
  emailForm: {
    gap: 10,
  },
  emailInput: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
  },
  emailButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  emailButtonDisabled: {
    opacity: 0.4,
  },
  emailButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  successBox: {
    backgroundColor: "rgba(62,235,190,0.1)",
    borderWidth: 1,
    borderColor: "rgba(62,235,190,0.3)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  successText: {
    fontSize: 15,
    color: "#3EEBBE",
  },
  errorBox: {
    backgroundColor: "rgba(220,38,38,0.1)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.3)",
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#f87171",
    textAlign: "center",
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    lineHeight: 18,
  },
  footerLink: {
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "underline",
  },
});
