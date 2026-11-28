import { glanceLines } from "@agent-board/app/domain/glance";
import { evaluateReadiness } from "@agent-board/app/domain/readiness";
import { STAGE_LABEL, type Ticket } from "@agent-board/app/domain/ticket";
import { type AgentView, RUN_STATE_LABEL } from "@agent-board/app/state/boardModel";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { ThreadActivity } from "./ThreadActivity";

function fileReadiness(ticket: Ticket, tickets: ReadonlyArray<Ticket>) {
  return evaluateReadiness({
    ticket,
    tickets,
    evidence: null,
    live: null,
    ciLocal: undefined,
    smoke: undefined,
    mergeOrderNote: null,
    reviewRoles: new Set(
      (ticket.verdicts ?? []).map((verdict) => verdict.role).filter((role) => role !== "verify"),
    ),
    now: Date.now(),
  }).filter((condition) => !condition.checking && condition.key !== "ci_green");
}

export function TicketSheet({
  ticket,
  tickets,
  decisions,
  agents,
  environmentId,
  presentation = "sheet",
  onClose,
}: {
  ticket: Ticket;
  tickets: ReadonlyArray<Ticket>;
  decisions: string | null;
  agents: ReadonlyArray<AgentView>;
  environmentId: EnvironmentId;
  /** A page sheet over the screen, or the right panel beside the wide canvas, like the desktop's Ticket tab. */
  presentation?: "sheet" | "panel";
  onClose: () => void;
}) {
  const [agent, setAgent] = useState<AgentView | null>(null);
  const pr = ticket.pr == null ? null : String(ticket.pr).trim();
  const body = (
    <>
      <View style={[styles.header, styles.sheetTop]}>
        <AppText style={[styles.headerText, styles.muted]}>
          {ticket.key} · {STAGE_LABEL[ticket.stage]}
        </AppText>
        <Pressable accessibilityRole="button" onPress={onClose}>
          <AppText style={styles.link}>Close</AppText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, styles.readable]}>
        <AppText style={styles.title}>{ticket.title}</AppText>
        {glanceLines({ ticket, tickets, size: null, smoke: null, decisions }).map((line) => (
          <AppText key={line.label} style={styles.small}>
            <AppText style={styles.muted}>{line.label}: </AppText>
            {line.text}
          </AppText>
        ))}
        {ticket.summary != null && (
          <View>
            <AppText style={styles.bold}>Summary</AppText>
            <AppText>{ticket.summary}</AppText>
          </View>
        )}
        {ticket.why != null && (
          <View>
            <AppText style={styles.bold}>Why</AppText>
            <AppText>{ticket.why}</AppText>
          </View>
        )}
        <View>
          <AppText style={styles.bold}>Readiness</AppText>
          {fileReadiness(ticket, tickets).map((condition) => (
            <AppText key={condition.key} style={condition.met ? undefined : styles.error}>
              {condition.met ? "✓" : "✗"} {condition.label}
              {condition.missing === null ? "" : `. ${condition.missing}`}
            </AppText>
          ))}
          <AppText style={[styles.small, styles.muted]}>
            CI and evidence checks show on the desktop.
          </AppText>
        </View>
        {agents.length > 0 && (
          <View>
            <AppText style={styles.bold}>Agents</AppText>
            {agents.map((entry) => (
              <Pressable
                key={entry.threadId}
                accessibilityRole="button"
                onPress={() => setAgent(entry)}
                style={styles.card}
              >
                <AppText style={styles.cardTitle} numberOfLines={1}>
                  {entry.title}
                </AppText>
                <AppText
                  style={[
                    styles.small,
                    entry.runState === "working" ? styles.working : styles.muted,
                  ]}
                >
                  {entry.role} · {RUN_STATE_LABEL[entry.runState]}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
        {pr !== null && (
          <View>
            <AppText style={styles.bold}>Pull request</AppText>
            {/^https?:\/\//.test(pr) ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(pr).catch(() => undefined)}
              >
                <AppText style={styles.link}>{pr}</AppText>
              </Pressable>
            ) : (
              <AppText>#{pr.replace(/^#/, "")}</AppText>
            )}
          </View>
        )}
      </ScrollView>
      {agent !== null && (
        <ThreadActivity
          environmentId={environmentId}
          threadId={ThreadId.make(agent.threadId)}
          title={agent.title}
          onClose={() => setAgent(null)}
        />
      )}
    </>
  );
  if (presentation === "panel") return <View style={styles.sidePanel}>{body}</View>;
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.sheet}>{body}</SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
