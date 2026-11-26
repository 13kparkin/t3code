import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BoardScreen } from "./BoardScreen";
import { NotPairedBanner } from "./NotPairedBanner";
import { PlaceholderScreen } from "./PlaceholderScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  const dark = useColorScheme() === "dark";
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={dark ? DarkTheme : DefaultTheme}>
        <NotPairedBanner />
        <Tab.Navigator screenOptions={{ headerShown: false }}>
          <Tab.Screen name="Board" component={BoardScreen} />
          <Tab.Screen name="Agents" component={PlaceholderScreen} />
          <Tab.Screen name="For you" component={PlaceholderScreen} />
          <Tab.Screen name="Chat" component={PlaceholderScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
