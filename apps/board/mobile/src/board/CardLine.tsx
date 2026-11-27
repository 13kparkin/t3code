import type { CardStatus } from "@agent-board/app/board/ticketStatus";
import type { TicketStage } from "@agent-board/app/domain/ticket";
import { toneStyle } from "@agent-board/app/theme/tokens";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { StageTag } from "./StageTag";

export function CardLine({
  tag,
  stage,
  title,
  status,
  detail,
}: {
  tag: string;
  stage: TicketStage;
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
      <View style={styles.cardDetail}>
        <StageTag stage={stage} />
        <AppText style={styles.cardDetailText} numberOfLines={1}>
          {detail}
        </AppText>
      </View>
    </>
  );
}
