import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color } from "../../../src/ui/theme";
import { TabBar, type TabSpec } from "../../../src/ui/components/foundation";
import { IconChart, IconHome } from "../../../src/ui/components/icons";

/** The props Expo Router hands the custom `tabBar` render callback. */
type NavTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Divvy Up shell tabs: Home · You. */
export const TABS: TabSpec[] = [
  { id: "index", icon: IconHome, label: "Home" },
  { id: "you", icon: IconChart, label: "You" },
];

export const TAB_BAR_CONTENT_HEIGHT = 60;
export const TAB_BAR_BOTTOM_GAP = 8;

/** Total tab-bar height including the safe-area bottom inset + float gap. */
export function tabBarHeight(insetBottom: number): number {
  return TAB_BAR_CONTENT_HEIGHT + insetBottom + TAB_BAR_BOTTOM_GAP;
}

/**
 * Custom tab-bar mount. Maps the active Expo Router route name to the
 * primitive's `active` id and forwards taps to `navigation.navigate`.
 */
export function NavTabBar({ props }: { props: NavTabBarProps }) {
  const insets = useSafeAreaInsets();
  const activeRoute = props.state.routeNames[props.state.index];

  const handleChange = (id: string) => {
    const route = props.state.routes.find((r) => r.name === id);
    if (!route) return;
    const event = props.navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (id !== activeRoute && !event.defaultPrevented) {
      props.navigation.navigate(id);
    }
  };

  return (
    <View
      testID="nav-tab-bar-safe-area"
      style={{ paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP }}
    >
      <TabBar
        tabs={TABS}
        active={activeRoute}
        mode="athlete"
        onChange={handleChange}
        testID="nav-tab-bar"
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.$bg },
      }}
      tabBar={(props) => <NavTabBar props={props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="you" options={{ title: "You" }} />
    </Tabs>
  );
}
