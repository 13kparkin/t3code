import { STAGE_LABEL, STAGE_TAGS, type TicketStage } from "@agent-board/app/domain/ticket";
import { toneStyle } from "@agent-board/app/theme/tokens";

import { AppText } from "../AppText";
import { styles } from "../styles";

const TONES = Object.fromEntries(
  Object.entries(STAGE_TAGS).map(([stage, { tone }]) => [stage, toneStyle(tone)]),
);

export function StageTag({ stage }: { stage: TicketStage }) {
  return <AppText style={[styles.tag, TONES[stage]]}>{STAGE_LABEL[stage]}</AppText>;
}
