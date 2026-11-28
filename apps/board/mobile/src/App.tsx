import { NavigationContainer } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { engineStatusAtom } from "./connection/engine";
import { PairScreen } from "./connection/PairScreen";
import { EngineHeader } from "./EngineHeader";
import { LoadingScreen } from "./shell/LoadingScreen";
import { Tabs } from "./shell/Tabs";
import { navTheme, styles } from "./styles";

export default function App() {
  const status = useAtomValue(engineStatusAtom).kind;
  return (
    <SafeAreaProvider style={styles.sheet}>
      <StatusBar barStyle="light-content" />
      <NavigationContainer theme={navTheme}>
        <EngineHeader />
        {status === "unpaired" ? (
          <PairScreen />
        ) : status === "loading" ? (
          <LoadingScreen text="Connecting to your PC" />
        ) : (
          <Tabs />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
