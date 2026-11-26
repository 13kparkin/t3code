import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import type { Icon } from "@tabler/icons-react-native/types";
/* Package-root imports eagerly register the entire Tabler icon set in Metro. */
import IconInbox from "@tabler/icons-react-native/IconInbox";
import IconLayoutKanban from "@tabler/icons-react-native/IconLayoutKanban";
import IconMessageCircle from "@tabler/icons-react-native/IconMessageCircle";
import IconRobot from "@tabler/icons-react-native/IconRobot";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BoardScreen } from "./BoardScreen";
import { NotPairedBanner } from "./NotPairedBanner";
import { PlaceholderScreen } from "./PlaceholderScreen";

const Tab = createBottomTabNavigator();

const tabIcon =
  (TabIcon: Icon) =>
  ({ color, size }: { color: string; size: number }) => <TabIcon color={color} size={size} />;

export default function App() {
  const dark = useColorScheme() === "dark";
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={dark ? DarkTheme : DefaultTheme}>
        <NotPairedBanner />
        <Tab.Navigator screenOptions={{ headerShown: false }}>
          <Tab.Screen
            name="Board"
            component={BoardScreen}
            options={{ tabBarIcon: tabIcon(IconLayoutKanban) }}
          />
          <Tab.Screen
            name="Agents"
            component={PlaceholderScreen}
            options={{ tabBarIcon: tabIcon(IconRobot) }}
          />
          <Tab.Screen
            name="For you"
            component={PlaceholderScreen}
            options={{ tabBarIcon: tabIcon(IconInbox) }}
          />
          <Tab.Screen
            name="Chat"
            component={PlaceholderScreen}
            options={{ tabBarIcon: tabIcon(IconMessageCircle) }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
