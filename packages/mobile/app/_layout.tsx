import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "../src/ui/components/ErrorBoundary";
import { AppProviders } from "../src/providers";
import { useAuth } from "../src/ui/hooks/useAuth";

/**
 * Auth gate — redirects between the (auth) and (app) route groups based on
 * the resolved Supabase session. Unauthenticated users land on sign-in;
 * authenticated users land on the tabs shell.
 */
function AuthGate() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAppGroup = segments[0] === "(app)";

    if (session && !inAppGroup) {
      router.replace("/(app)/(tabs)");
    } else if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    }
  }, [session, isLoading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  // `GestureHandlerRootView` is required by react-native-gesture-handler for
  // any descendant `<GestureDetector>` to recognise touches. It sits at the
  // root above every other provider so all descendants share the same
  // gesture root.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AppProviders>
          <AuthGate />
        </AppProviders>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
