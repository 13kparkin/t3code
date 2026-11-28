import {
  BOARD_SECTIONS,
  DONE_TAG,
  ORCHESTRATOR_BOX,
  sectionFilterId,
  stageTagCount,
  stageTagId,
} from "@agent-board/app/board/layout";
import { STAGE_LABEL, TICKET_STAGES, type TicketStage } from "@agent-board/app/domain/ticket";
import { Pressable, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";

/** The desktop's orchestrator card: the board, its section toggles, and the tags that show or hide lanes and stages. */
export function CanvasOrchestratorCard({
  name,
  started,
  stages,
  todoAgents,
  doneCount,
  forYouOpen,
  hidden,
  onToggle,
}: {
  name: string;
  started: boolean;
  stages: Readonly<Record<TicketStage, number>>;
  todoAgents: number;
  doneCount: number;
  forYouOpen: number;
  hidden: ReadonlySet<string>;
  onToggle: (filterId: string) => void;
}) {
  const tags = [
    ...TICKET_STAGES.map((stage) => ({
      id: stageTagId(stage),
      label: STAGE_LABEL[stage],
      count: stageTagCount(stage, stages, todoAgents),
    })),
    { id: DONE_TAG, label: "Done", count: doneCount },
    { id: "for_you", label: "For you", count: forYouOpen },
  ];
  return (
    <View
      accessibilityLabel="Orchestrator card"
      style={[
        styles.orchestratorCard,
        { left: ORCHESTRATOR_BOX.x, top: ORCHESTRATOR_BOX.y, width: ORCHESTRATOR_BOX.width },
      ]}
    >
      <View style={styles.cardRow}>
        <AppText style={[styles.bold, styles.fill]} numberOfLines={1}>
          {name}
        </AppText>
        <AppText style={styles.cardStatus}>{started ? "Started" : "Not started"}</AppText>
      </View>
      <View style={styles.cardRow}>
        <AppText style={[styles.small, styles.faint, styles.fill]}>Orchestrator</AppText>
        {BOARD_SECTIONS.map(({ id, label }) => {
          const on = !hidden.has(sectionFilterId(id));
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onToggle(sectionFilterId(id))}
              style={[styles.sectionToggle, on && styles.sectionToggleOn]}
            >
              <AppText style={[styles.small, on ? undefined : styles.muted]}>{label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.tagRow}>
        {tags.map(({ id, label, count }) => {
          const on = !hidden.has(id);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onToggle(id)}
              style={[styles.tagChip, on && styles.tagChipOn]}
            >
              <AppText style={[styles.small, on ? undefined : styles.faint]}>
                {label} {count}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
