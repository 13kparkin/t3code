import { evaluateReadiness } from "@agent-board/app/domain/readiness";
import { STAGE_LABEL, type Ticket } from "@agent-board/app/domain/ticket";
import { useTheme } from "@react-navigation/native";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

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
  onClose,
}: {
  ticket: Ticket;
  tickets: ReadonlyArray<Ticket>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const text = { color: colors.text };
  const pr = ticket.pr == null ? null : String(ticket.pr).trim();
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
          <View style={[styles.header, styles.sheetTop]}>
            <Text style={[styles.headerText, styles.muted, text]}>
              {ticket.key} · {STAGE_LABEL[ticket.stage]}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.title, text]}>{ticket.title}</Text>
            {ticket.summary != null && (
              <View>
                <Text style={[styles.bold, text]}>Summary</Text>
                <Text style={text}>{ticket.summary}</Text>
              </View>
            )}
            {ticket.why != null && (
              <View>
                <Text style={[styles.bold, text]}>Why</Text>
                <Text style={text}>{ticket.why}</Text>
              </View>
            )}
            <View>
              <Text style={[styles.bold, text]}>Readiness</Text>
              {fileReadiness(ticket, tickets).map((condition) => (
                <Text key={condition.key} style={condition.met ? text : styles.error}>
                  {condition.met ? "✓" : "✗"} {condition.label}
                  {condition.missing === null ? "" : `. ${condition.missing}`}
                </Text>
              ))}
              <Text style={[styles.small, styles.muted, text]}>
                CI and evidence checks show on the desktop.
              </Text>
            </View>
            {pr !== null && (
              <View>
                <Text style={[styles.bold, text]}>Pull request</Text>
                {/^https?:\/\//.test(pr) ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(pr).catch(() => undefined)}
                  >
                    <Text style={styles.link}>{pr}</Text>
                  </Pressable>
                ) : (
                  <Text style={text}>#{pr.replace(/^#/, "")}</Text>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
