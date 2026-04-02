import { View, ActivityIndicator, StyleSheet } from "react-native";

// This route exists so expo-router doesn't show "Unmatched Route" when the
// deep link switchifye://auth/callback arrives. The actual session exchange
// is handled by the deep link listener in _layout.tsx.

export default function AuthCallbackScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3EEBBE" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1C",
    alignItems: "center",
    justifyContent: "center",
  },
});
