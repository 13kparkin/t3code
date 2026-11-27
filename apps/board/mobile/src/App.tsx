import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import type { Icon } from "@tabler/icons-react-native/types";
/* Package-root imports eagerly register the entire Tabler icon set in Metro. */
import IconInbox from "@tabler/icons-react-native/IconInbox";
import IconLayoutKanban from "@tabler/icons-react-native/IconLayoutKanban";
import IconMessageCircle from "@tabler/icons-react-native/IconMessageCircle";
import IconRobot from "@tabler/icons-react-native/IconRobot";
import { useAtomValue } from "@effect/atom-react";
import { StatusBar, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AgentsScreen } from "./board/AgentsScreen";
import { BoardScreen } from "./board/BoardScreen";
import { engineStatusAtom } from "./connection/engine";
import { PairScreen } from "./connection/PairScreen";
import { EngineHeader } from "./EngineHeader";
import { forYouOpenCountAtom } from "./foryou/forYouAtoms";
import { ForYouScreen } from "./foryou/ForYouScreen";
import { PlaceholderScreen } from "./PlaceholderScreen";

const Tab = createBottomTabNavigator();

const tabIcon =
  (TabIcon: Icon) =>
  ({ color, size }: { color: string; size: number }) => <TabIcon color={color} size={size} />;

export default function App() {
  const dark = useColorScheme() === "dark";
  const status = useAtomValue(engineStatusAtom).kind;
  const openCount = useAtomValue(forYouOpenCountAtom);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <NavigationContainer theme={dark ? DarkTheme : DefaultTheme}>
        <EngineHeader />
        {status === "unpaired" ? (
          <PairScreen />
        ) : status === "loading" ? null : (
          <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen
              name="Board"
              component={BoardScreen}
              options={{ tabBarIcon: tabIcon(IconLayoutKanban) }}
            />
            <Tab.Screen
              name="Agents"
              component={AgentsScreen}
              options={{ tabBarIcon: tabIcon(IconRobot) }}
            />
            <Tab.Screen
              name="For you"
              component={ForYouScreen}
              options={{
                tabBarIcon: tabIcon(IconInbox),
                tabBarBadge: openCount > 0 ? openCount : undefined,
              }}
            />
            <Tab.Screen
              name="Chat"
              component={PlaceholderScreen}
              options={{ tabBarIcon: tabIcon(IconMessageCircle) }}
            />
          </Tab.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
