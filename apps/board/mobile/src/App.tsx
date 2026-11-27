import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { COLORS } from "@agent-board/app/theme/tokens";
import { NavigationContainer } from "@react-navigation/native";
import type { Icon } from "@tabler/icons-react-native/types";
/* Package-root imports eagerly register the entire Tabler icon set in Metro. */
import IconInbox from "@tabler/icons-react-native/IconInbox";
import IconLayoutKanban from "@tabler/icons-react-native/IconLayoutKanban";
import IconMessageCircle from "@tabler/icons-react-native/IconMessageCircle";
import IconRobot from "@tabler/icons-react-native/IconRobot";
import { useAtomValue } from "@effect/atom-react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AgentsScreen } from "./board/AgentsScreen";
import { BoardScreen } from "./board/BoardScreen";
import { ChatScreen } from "./chat/ChatScreen";
import { engineStatusAtom } from "./connection/engine";
import { PairScreen } from "./connection/PairScreen";
import { EngineHeader } from "./EngineHeader";
import { forYouOpenCountAtom } from "./foryou/forYouAtoms";
import { ForYouScreen } from "./foryou/ForYouScreen";
import { navTheme, styles } from "./styles";

const Tab = createBottomTabNavigator();

const tabIcon =
  (TabIcon: Icon) =>
  ({ color, size }: { color: string; size: number }) => <TabIcon color={color} size={size} />;

export default function App() {
  const status = useAtomValue(engineStatusAtom).kind;
  const openCount = useAtomValue(forYouOpenCountAtom);
  return (
    <SafeAreaProvider style={styles.sheet}>
      <StatusBar barStyle="light-content" />
      <NavigationContainer theme={navTheme}>
        <EngineHeader />
        {status === "unpaired" ? (
          <PairScreen />
        ) : status === "loading" ? null : (
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarInactiveTintColor: COLORS.faint,
              tabBarBadgeStyle: { color: COLORS.bg },
            }}
          >
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
              component={ChatScreen}
              options={{ tabBarIcon: tabIcon(IconMessageCircle), tabBarHideOnKeyboard: true }}
            />
          </Tab.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
