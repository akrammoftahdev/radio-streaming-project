import { Slot, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { useEffect, useState } from "react";
import { auth } from "../core/auth";
import { View, ActivityIndicator } from "react-native";
import { colors } from "../theme/colors";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    // Crucial: Wait for the router to finish mounting
    if (!rootNavigationState?.key) return;

    const checkAuth = async () => {
      try {
        const token = await auth.getToken();
        const currentGroup = segments[0];

        if (!token) {
          if (currentGroup !== "login") {
            router.replace("/login");
          }
        } else {
          if (currentGroup === "login") {
            router.replace("/");
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsReady(true);
      }
    };

    checkAuth();
  }, [segments, rootNavigationState?.key]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Slot />
    </>
  );
}
