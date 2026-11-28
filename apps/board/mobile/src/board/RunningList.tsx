import type { AgentView } from "@agent-board/app/state/boardModel";
import { type RunningItem, runningItems } from "@agent-board/app/state/cardStates";
import { ThreadId } from "@t3tools/contracts";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import type { ShownBoard } from "./BoardFrame";
import { RunningTicket } from "./RunningTicket";
import { ThreadActivity } from "./ThreadActivity";
import { TicketSheet } from "./TicketSheet";
import { useBoardModel } from "./useBoardModel";

const itemKey = (item: RunningItem) =>
  item.kind === "agent" ? item.agent.threadId : item.view.ticket.key;

export function RunningList({ choice }: { choice: ShownBoard }) {
  const { files, failure, tickets, split, now } = useBoardModel(choice);
  const [open, setOpen] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentView | null>(null);
  if (files === null) return <AppText style={styles.body}>Reading the board</AppText>;
  if (choice.listed.board.orchestratorThreadId === null) {
    return <AppText style={styles.body}>This board's orchestrator has not started.</AppText>;
  }
  const items = split === null ? [] : runningItems(split, now);
  const openView = items.find((item) => item.kind === "ticket" && item.view.ticket.key === open);
  return (
    <>
      {failure !== null && (
        <View accessibilityRole="alert" style={styles.banner}>
          <AppText style={[styles.error, styles.bold]}>
            tickets.json has a bad {failure.fields.length === 1 ? "field" : "fields"}
            {failure.fields.length > 0 ? `: ${failure.fields.join(", ")}` : ""}. Showing the last
            valid layout.
          </AppText>
          <AppText style={[styles.error, styles.small]}>{failure.message}</AppText>
        </View>
      )}
      <ScrollView style={styles.readable} contentContainerStyle={styles.body}>
        {items.length === 0 && (
          <AppText style={styles.muted}>
            {split === null ? "Reading the agents" : "Nothing is running."}
          </AppText>
        )}
        {items.map((item) =>
          item.kind === "agent" ? (
            <Pressable
              key={itemKey(item)}
              accessibilityRole="button"
              onPress={() => setAgent(item.agent)}
              style={styles.card}
            >
              <AppText style={[styles.bold, styles.cardTitle]} numberOfLines={1}>
                {item.agent.title}
              </AppText>
              <AppText style={[styles.small, styles.working]}>{item.agent.role} · Working</AppText>
            </Pressable>
          ) : (
            <Pressable
              key={itemKey(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.view.ticket.key} ${item.view.ticket.title}`}
              onPress={() => setOpen(item.view.ticket.key)}
              style={styles.card}
            >
              <RunningTicket view={item.view} tickets={tickets} now={now} />
            </Pressable>
          ),
        )}
      </ScrollView>
      {openView?.kind === "ticket" && (
        <TicketSheet
          ticket={openView.view.ticket}
          tickets={tickets}
          decisions={files.decisions ?? null}
          agents={openView.view.agents}
          environmentId={choice.project.environmentId}
          onClose={() => setOpen(null)}
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
    </>
  );
}
