import type { CardStatus } from "@agent-board/app/board/ticketStatus";
import { toneStyle } from "@agent-board/app/theme/tokens";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";

export function CardLine({
  tag,
  title,
  status,
  detail,
}: {
  tag: string;
  title: string;
  status: CardStatus | null;
  detail: ReactNode;
}) {
  return (
    <>
      <View style={styles.cardRow}>
        <View
          style={[styles.cardDot, status === null ? styles.emptyDot : toneStyle(status.tone)]}
        />
        <AppText style={styles.cardKey}>{tag}</AppText>
        <AppText style={[styles.cardTitle, styles.fill]} numberOfLines={1}>
          {title}
        </AppText>
        {status !== null && <AppText style={styles.cardStatus}>{status.word}</AppText>}
      </View>
      <AppText style={styles.cardDetail} numberOfLines={2}>
        {detail}
      </AppText>
    </>
  );
}
