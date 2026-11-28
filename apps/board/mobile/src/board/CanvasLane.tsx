import { LANE_HEAD, LANE_LABEL, LANE_TONE, type LaneBox } from "@agent-board/app/board/layout";
import { toneStyle } from "@agent-board/app/theme/tokens";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";

/** A lane at the desktop's place and size, its cards scrolling inside it as on the desktop. */
export function CanvasLane({
  lane,
  count,
  children,
}: {
  lane: LaneBox;
  count: number;
  children: ReactNode;
}) {
  return (
    <View
      accessibilityLabel={`${LANE_LABEL[lane.id]} lane`}
      style={[
        styles.canvasFrame,
        { left: lane.x, top: lane.y, width: lane.width, height: lane.height },
      ]}
    >
      <View style={[styles.laneHead, { height: LANE_HEAD }]}>
        <AppText style={[styles.laneTag, toneStyle(LANE_TONE[lane.id])]}>
          {LANE_LABEL[lane.id]}
        </AppText>
        <AppText style={[styles.small, styles.faint]}>{count}</AppText>
      </View>
      <ScrollView nestedScrollEnabled style={styles.fill}>
        {children}
      </ScrollView>
    </View>
  );
}
