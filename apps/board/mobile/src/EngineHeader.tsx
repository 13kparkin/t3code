import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { useContext } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { engineStatusAtom, unpair } from "./connection/engine";
import type { EngineStatus } from "./connection/status";
import { styles } from "./styles";

const DOT = {
  loading: "#9CA3AF",
  unpaired: "#9CA3AF",
  connecting: "#F5C451",
  reconnecting: "#F5C451",
  connected: "#22C55E",
  refused: "#DC2626",
} satisfies Record<EngineStatus["kind"], string>;

function statusText(status: EngineStatus) {
  switch (status.kind) {
    case "loading":
      return "Loading";
    case "unpaired":
      return "Not paired";
    case "connecting":
      return `Connecting to ${status.label}`;
    case "reconnecting":
      return "Reconnecting";
    case "connected":
      return `Connected to ${status.label}`;
    case "refused":
      return status.detail;
  }
}

export function EngineHeader() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const registry = useContext(RegistryContext);
  const status = useAtomValue(engineStatusAtom);
  return (
    <View
      style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.dot, { backgroundColor: DOT[status.kind] }]} />
      <Text style={[styles.headerText, { color: colors.text }]} numberOfLines={2}>
        {statusText(status)}
      </Text>
      {"environmentId" in status && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void unpair(registry, status.environmentId)}
        >
          <Text style={styles.link}>{status.kind === "refused" ? "Pair again" : "Unpair"}</Text>
        </Pressable>
      )}
    </View>
  );
}
