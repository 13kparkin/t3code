import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";

/** One of the board's sections right of the orchestrator card, drawn like the desktop's: a dashed frame, no background. */
export function CanvasSection({
  title,
  note,
  left,
  top,
  width,
  height,
  children,
}: {
  title: string;
  note: string;
  left: number;
  top: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <View style={[styles.canvasFrame, { left, top, width, height }]} accessibilityLabel={title}>
      <View style={styles.laneHead}>
        <AppText style={[styles.small, styles.bold, styles.muted]}>{title}</AppText>
        <AppText style={[styles.small, styles.faint]}>{note}</AppText>
      </View>
      <ScrollView nestedScrollEnabled contentContainerStyle={styles.sectionBody}>
        {children}
      </ScrollView>
    </View>
  );
}
