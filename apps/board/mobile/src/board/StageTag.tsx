import { STAGE_LABEL, STAGE_TAGS, type TicketStage } from "@agent-board/app/domain/ticket";
import { toneStyle } from "@agent-board/app/theme/tokens";

import { AppText } from "../AppText";
import { styles } from "../styles";

export function StageTag({ stage }: { stage: TicketStage }) {
  return (
    <AppText style={[styles.tag, toneStyle(STAGE_TAGS[stage].tone)]}>{STAGE_LABEL[stage]}</AppText>
  );
}
