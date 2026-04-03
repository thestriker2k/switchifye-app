import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

export default function ExploreScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Your Safety, Simplified</Text>
        <Text style={styles.body}>
          Switchifye is a smart safety switch that automatically alerts your
          emergency contacts if you don't check in on time. Whether you're
          traveling solo, living alone, or working in remote areas — Switchifye
          has your back.
        </Text>

        <View style={styles.features}>
          <Text style={styles.feature}>
            Set custom check-in timers tailored to your routine
          </Text>
          <Text style={styles.feature}>
            Add trusted emergency contacts who get notified instantly
          </Text>
          <Text style={styles.feature}>
            Stay protected with automatic alerts — no action needed if you're safe
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.replace("/login")}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={["#4A9FF5", "#3EEBBE"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Create Free Account</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>
          No credit card required · Free forever on the basic plan
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0F1C",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  logo: {
    width: 160,
    height: 40,
    alignSelf: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginBottom: 24,
  },
  features: {
    gap: 12,
    marginBottom: 36,
  },
  feature: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  cta: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  disclaimer: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 12,
  },
});
