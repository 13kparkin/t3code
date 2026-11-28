import { COLORS } from "@agent-board/app/theme/tokens";
import { ActivityIndicator, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";

export function LoadingScreen({ text }: { text: string }) {
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite">
      <ActivityIndicator color={COLORS.muted} />
      <AppText style={styles.muted}>{text}</AppText>
    </View>
  );
}
