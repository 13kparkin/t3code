import {
  agentsKey,
  forYouHeight,
  hiddenFilters,
  LANE_GAP,
  LANE_HEAD,
  LANE_PAD,
  LANE_WIDTH,
  layoutBoard,
  ORCHESTRATOR_BOX,
  sectionFilterId,
} from "@agent-board/app/board/layout";
import { classifyArtifact, KIND_LABEL } from "@agent-board/app/domain/artifact";
import {
  CARD_STATE,
  cardKindLabel,
  cardTitle,
  type ForYouCard,
} from "@agent-board/app/domain/forYou";
import { SYSTEM_TEMPLATE } from "@agent-board/app/domain/reviewTemplate";
import { TICKET_STAGES } from "@agent-board/app/domain/ticket";
import { type AgentView, RUN_STATE_LABEL } from "@agent-board/app/state/boardModel";
import { agentRowCounts } from "@agent-board/app/state/cardStates";
import { toneStyle } from "@agent-board/app/theme/tokens";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { ThreadId } from "@t3tools/contracts";
import { useContext, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "../AppText";
import { CardSheet } from "../foryou/CardSheet";
import { useForYouViews } from "../foryou/useForYouViews";
import { styles } from "../styles";
import type { ShownBoard } from "./BoardFrame";
import { canvasFlipsAtom } from "./canvasFilters";
import { CanvasLane } from "./CanvasLane";
import { CanvasOrchestratorCard } from "./CanvasOrchestratorCard";
import { CanvasSection } from "./CanvasSection";
import { boardEntriesAtom } from "./files";
import { PanZoom } from "./PanZoom";
import { RunningTicket } from "./RunningTicket";
import { ThreadActivity } from "./ThreadActivity";
import { TicketSheet } from "./TicketSheet";
import { useBoardModel } from "./useBoardModel";

const SECTION_TOP = ORCHESTRATOR_BOX.y;
const SECTION_HEIGHT = 240;
const SECTION_LEFT = ORCHESTRATOR_BOX.x + ORCHESTRATOR_BOX.width + LANE_GAP;

/** The desktop board's canvas on a wide screen, laid out by the desktop's own `layoutBoard`. */
export function BoardCanvas({ choice }: { choice: ShownBoard }) {
  const registry = useContext(RegistryContext);
  const { board } = choice.listed;
  const { files, tickets, split, now } = useBoardModel(choice);
  const { views, target } = useForYouViews(choice);
  const flips = useAtomValue(canvasFlipsAtom(choice.key));
  const entries = useAtomValue(boardEntriesAtom(choice.key));
  const [ticketKey, setTicketKey] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [card, setCard] = useState<ForYouCard | null>(null);
  const hidden = useMemo(() => hiddenFilters(new Set(flips.split(","))), [flips]);
  const shownViews = useMemo(() => views.filter((view) => view.state !== "resolved"), [views]);
  const layout = useMemo(
    () =>
      split === null
        ? null
        : layoutBoard(
            split.model,
            {},
            forYouHeight(views),
            hidden,
            [],
            0,
            agentRowCounts(split),
            now,
          ),
    [split, views, hidden, now],
  );
  if (files === null || split === null || layout === null) {
    return <AppText style={styles.body}>Reading the board</AppText>;
  }
  const toggle = (id: string) => {
    const next = new Set(flips.split(",").filter((entry) => entry !== ""));
    if (!next.delete(id)) next.add(id);
    registry.set(canvasFlipsAtom(choice.key), [...next].join(","));
  };
  const ticketViews = new Map(
    TICKET_STAGES.flatMap((stage) => split.model.lanes[stage]).map((view) => [
      view.ticket.key,
      view,
    ]),
  );
  // SAFETY: the entries map every stage in TICKET_STAGES, so each key is present.
  const stages = Object.fromEntries(
    TICKET_STAGES.map((stage) => [stage, split.model.lanes[stage].length]),
  ) as Record<(typeof TICKET_STAGES)[number], number>;
  const rows = agentRowCounts(split);
  const openTicket = ticketKey === null ? undefined : ticketViews.get(ticketKey);
  const openCard = views.find((view) => view.card.id === card?.id) ?? null;
  const sections = [
    !hidden.has(sectionFilterId("artifacts")) && "artifacts",
    !hidden.has(sectionFilterId("archived")) && "archived",
    !hidden.has(sectionFilterId("review")) && "review",
  ].filter((id) => id !== false);
  const artifactNames = (entries ?? []).flatMap((entry) => {
    const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    if (entry.kind === "directory") return [{ name, hint: "Folder" }];
    const artifact = classifyArtifact(name);
    return artifact === null ? [] : [{ name, hint: KIND_LABEL[artifact.kind] }];
  });

  return (
    <View style={styles.canvasRow}>
      <PanZoom content={layout.content}>
        <CanvasOrchestratorCard
          name={board.name}
          started={board.orchestratorThreadId !== null}
          stages={stages}
          todoAgents={rows.todo}
          doneCount={rows.done + stages.merged + stages.off_path}
          forYouOpen={shownViews.length}
          hidden={hidden}
          onToggle={toggle}
        />
        {sections.map((id, index) => {
          const place = {
            left: SECTION_LEFT + index * (LANE_WIDTH + LANE_GAP),
            top: SECTION_TOP,
            width: LANE_WIDTH,
            height: SECTION_HEIGHT,
          };
          if (id === "artifacts") {
            return (
              <CanvasSection
                key={id}
                title="Artifacts"
                note={String(artifactNames.length)}
                {...place}
              >
                {artifactNames.map(({ name, hint }) => (
                  <View key={name} style={styles.tile}>
                    <AppText style={[styles.small, styles.fill]} numberOfLines={1}>
                      {name}
                    </AppText>
                    <AppText style={[styles.tag, styles.muted]}>{hint}</AppText>
                  </View>
                ))}
              </CanvasSection>
            );
          }
          if (id === "archived") {
            return (
              <CanvasSection
                key={id}
                title="Archived"
                note={String(split.archived.length)}
                {...place}
              >
                {split.archived.length === 0 ? (
                  <AppText style={[styles.small, styles.faint]}>Nothing is archived.</AppText>
                ) : (
                  split.archived.map((entry) => (
                    <View key={entry.key} style={styles.tile}>
                      <AppText style={[styles.small, styles.fill]} numberOfLines={1}>
                        {entry.label}
                      </AppText>
                    </View>
                  ))
                )}
              </CanvasSection>
            );
          }
          return (
            <CanvasSection
              key={id}
              title="Review"
              note={board.reviewTemplate ?? SYSTEM_TEMPLATE.name}
              {...place}
            >
              <AppText style={[styles.small, styles.faint]}>
                The board's review template. Change it on the desktop.
              </AppText>
            </CanvasSection>
          );
        })}
        {layout.lanes.map((lane) => {
          const stage = lane.id;
          if (stage === "for_you") {
            return (
              <CanvasLane key={lane.id} lane={lane} count={shownViews.length}>
                <View style={styles.laneCards}>
                  {shownViews.length === 0 && (
                    <AppText style={[styles.small, styles.faint]}>Nothing needs you</AppText>
                  )}
                  {shownViews.map((view) => (
                    <Pressable
                      key={view.card.id}
                      accessibilityRole="button"
                      onPress={() => setCard(view.card)}
                      style={styles.frameCard}
                    >
                      <View style={styles.cardRow}>
                        <AppText style={[styles.tag, styles.muted, styles.bold]}>
                          {cardKindLabel(view.card)}
                        </AppText>
                        <View style={styles.fill} />
                        <AppText style={[styles.tag, toneStyle(CARD_STATE[view.state].chip)]}>
                          {CARD_STATE[view.state].label}
                        </AppText>
                      </View>
                      <AppText style={[styles.bold, styles.cardTitle]} numberOfLines={2}>
                        {cardTitle(view.card)}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </CanvasLane>
            );
          }
          return (
            <CanvasLane
              key={lane.id}
              lane={lane}
              count={lane.frames.filter((frame) => ticketViews.has(frame.key)).length + rows[stage]}
            >
              <View
                style={{
                  height: Math.max(
                    0,
                    ...lane.frames.map((frame) => frame.y + frame.height - lane.y - LANE_HEAD),
                  ),
                }}
              >
                {lane.frames.map((frame) => {
                  const place = {
                    position: "absolute" as const,
                    left: LANE_PAD,
                    top: frame.y - lane.y - LANE_HEAD,
                    width: frame.width,
                    height: frame.height,
                  };
                  const view = ticketViews.get(frame.key);
                  if (view !== undefined) {
                    return (
                      <Pressable
                        key={frame.key}
                        accessibilityRole="button"
                        accessibilityLabel={`${view.ticket.key} ${view.ticket.title}`}
                        onPress={() => setTicketKey(view.ticket.key)}
                        style={[styles.frameCard, place]}
                      >
                        <RunningTicket view={view} tickets={tickets} now={now} />
                      </Pressable>
                    );
                  }
                  if (frame.key !== agentsKey(stage)) return null;
                  return (
                    <View key={frame.key} style={[styles.frameCard, place]}>
                      {split.agents[stage].map((entry) => (
                        <Pressable
                          key={entry.threadId}
                          accessibilityRole="button"
                          onPress={() => setAgent(entry)}
                          style={styles.cardRow}
                        >
                          <AppText style={[styles.small, styles.fill]} numberOfLines={1}>
                            {entry.title}
                          </AppText>
                          <AppText style={styles.cardStatus}>
                            {RUN_STATE_LABEL[entry.runState]}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            </CanvasLane>
          );
        })}
      </PanZoom>
      {openTicket !== undefined && (
        <TicketSheet
          presentation="panel"
          ticket={openTicket.ticket}
          tickets={tickets}
          decisions={files.decisions ?? null}
          agents={openTicket.agents}
          environmentId={choice.project.environmentId}
          onClose={() => setTicketKey(null)}
        />
      )}
      {agent !== null && (
        <ThreadActivity
          environmentId={choice.project.environmentId}
          threadId={ThreadId.make(agent.threadId)}
          title={agent.title}
          onClose={() => setAgent(null)}
        />
      )}
      {card !== null && openCard !== null && (
        <CardSheet view={openCard} shown={card} target={target} onClose={() => setCard(null)} />
      )}
    </View>
  );
}
