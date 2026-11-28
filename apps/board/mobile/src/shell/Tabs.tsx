import { type BottomTabBarProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { COLORS } from "@agent-board/app/theme/tokens";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { useState } from "react";

import { forYouOpenCountAtom, startTabAtom } from "../foryou/forYouAtoms";
import { LoadingScreen } from "./LoadingScreen";
import { PhoneSidebar } from "./PhoneSidebar";
import { PHONE_TABS, type PhoneTab } from "./tabs";
import { useWide } from "./useWide";

const Tab = createBottomTabNavigator();
const STARTED = Atom.make(null).pipe(Atom.withLabel("phone-start-tab:started"));

const renderSidebar = (props: BottomTabBarProps) => <PhoneSidebar {...props} />;

const tabIcon =
  (TabIcon: PhoneTab["icon"]) =>
  ({ color, size }: { color: string; size: number }) => <TabIcon color={color} size={size} />;

/** Opens once on the tab `startTabAtom` picks, then stops reading it, so its file poll ends. */
export function Tabs() {
  const [initial, setInitial] = useState<PhoneTab["name"] | null>(null);
  const start = useAtomValue(initial === null ? startTabAtom : STARTED);
  const openCount = useAtomValue(forYouOpenCountAtom);
  const wide = useWide();
  if (initial === null && start !== null) setInitial(start);
  if (initial === null) return <LoadingScreen text="Reading your boards" />;
  return (
    <Tab.Navigator
      initialRouteName={initial}
      {...(wide ? { tabBar: renderSidebar } : {})}
      screenOptions={{
        tabBarPosition: wide ? "left" : "bottom",
        headerShown: false,
        tabBarInactiveTintColor: COLORS.faint,
        tabBarBadgeStyle: { color: COLORS.bg },
      }}
    >
      {PHONE_TABS.map(({ name, icon, component }) => (
        <Tab.Screen
          key={name}
          name={name}
          component={component}
          options={{
            tabBarIcon: tabIcon(icon),
            tabBarBadge: name === "For you" && openCount > 0 ? openCount : undefined,
            tabBarHideOnKeyboard: name === "Chat",
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
