import { glanceLines } from "@agent-board/app/domain/glance";
import { evaluateReadiness } from "@agent-board/app/domain/readiness";
import { STAGE_LABEL, type Ticket } from "@agent-board/app/domain/ticket";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "../AppText";
import { styles } from "../styles";

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
  onClose,
}: {
  ticket: Ticket;
  tickets: ReadonlyArray<Ticket>;
  decisions: string | null;
  onClose: () => void;
}) {
  const pr = ticket.pr == null ? null : String(ticket.pr).trim();
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.sheet}>
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
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
