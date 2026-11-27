import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { COLORS, PALETTE } from "@agent-board/app/theme/tokens";
import { useContext } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { engineStatusAtom, unpair } from "./connection/engine";
import type { EngineStatus } from "./connection/status";
import { styles } from "./styles";

const DOT = {
  loading: COLORS.offline,
  unpaired: COLORS.offline,
  connecting: PALETTE["amber-400"],
  reconnecting: PALETTE["amber-400"],
  connected: PALETTE["emerald-400"],
  refused: PALETTE["red-400"],
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
  const insets = useSafeAreaInsets();
  const registry = useContext(RegistryContext);
  const status = useAtomValue(engineStatusAtom);
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]} accessibilityLiveRegion="polite">
      <View style={[styles.dot, { backgroundColor: DOT[status.kind] }]} />
      <AppText style={styles.headerText} numberOfLines={2}>
        {statusText(status)}
      </AppText>
      {"environmentId" in status && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void unpair(registry, status.environmentId)}
        >
          <AppText style={styles.link}>
            {status.kind === "refused" ? "Pair again" : "Unpair"}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
