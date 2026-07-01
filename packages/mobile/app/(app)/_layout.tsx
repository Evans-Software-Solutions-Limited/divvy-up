import { Stack } from "expo-router";
import { colorPalette } from "../../src/ui/theme";

/**
 * Authenticated app shell. A Stack that hosts the tab navigator plus any
 * over-tabs routes. Screens render their own chrome, so the native header is
 * off by default.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colorPalette.neutral1000 },
        headerTintColor: colorPalette.neutral0,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: colorPalette.neutral1000 },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="sync-blocked"
        options={{ title: "Sync blocked", headerShown: true }}
      />
    </Stack>
  );
}
