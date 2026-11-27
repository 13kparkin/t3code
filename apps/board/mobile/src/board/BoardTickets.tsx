import { glanceLines } from "@agent-board/app/domain/glance";
import {
  parseTickets,
  STAGE_LABEL,
  TICKET_STAGES,
  type Ticket,
} from "@agent-board/app/domain/ticket";
import { useTheme } from "@react-navigation/native";
import * as Result from "effect/Result";
import { useMemo, useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";

import { styles } from "../styles";
import { type BoardChoice, useBoardFiles } from "./files";
import { TicketSheet } from "./TicketSheet";

const NO_TICKETS: ReadonlyArray<Ticket> = [];

export function BoardTickets({ choice }: { choice: BoardChoice }) {
  const { colors } = useTheme();
  const files = useBoardFiles(choice.key);
  const ticketsText = files?.tickets ?? null;
  const parsed = useMemo(
    () => (ticketsText === null ? Result.succeed(NO_TICKETS) : parseTickets(ticketsText)),
    [ticketsText],
  );
  const [lastValid, setLastValid] = useState(NO_TICKETS);
  if (Result.isSuccess(parsed) && parsed.success !== lastValid) setLastValid(parsed.success);
  const tickets = Result.isSuccess(parsed) ? parsed.success : lastValid;
  const decisions = files?.decisions ?? null;
  const sections = useMemo(
    () =>
      TICKET_STAGES.flatMap((stage) => {
        const data = tickets.filter((ticket) => ticket.stage === stage);
        return data.length === 0 ? [] : [{ stage, data }];
      }),
    [tickets],
  );
  const [open, setOpen] = useState<string | null>(null);
  const openTicket = tickets.find((ticket) => ticket.key === open) ?? null;

  if (files === null) {
    return <Text style={[styles.body, { color: colors.text }]}>Reading the board</Text>;
  }
  return (
    <>
      {Result.isFailure(parsed) && (
        <View accessibilityRole="alert" style={styles.banner}>
          <Text style={[styles.error, styles.bold]}>
            tickets.json has a bad {parsed.failure.fields.length === 1 ? "field" : "fields"}
            {parsed.failure.fields.length > 0 ? `: ${parsed.failure.fields.join(", ")}` : ""}.
            Showing the last valid layout.
          </Text>
          <Text style={[styles.error, styles.small]}>{parsed.failure.message}</Text>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(ticket) => ticket.key}
        style={styles.readable}
        contentContainerStyle={styles.body}
        ListEmptyComponent={
          <Text style={[styles.muted, { color: colors.text }]}>This board has no tickets.</Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.title, { color: colors.text, backgroundColor: colors.background }]}>
            {STAGE_LABEL[section.stage]} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => {
          const [glance] = glanceLines({
            ticket: item,
            tickets,
            size: null,
            smoke: null,
            decisions,
          });
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(item.key)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.small, styles.muted, { color: colors.text }]}>{item.key}</Text>
              <Text style={[styles.bold, { color: colors.text }]}>{item.title}</Text>
              {glance !== undefined && (
                <Text style={[styles.small, { color: colors.text }]} numberOfLines={2}>
                  {glance.label}: {glance.text}
                </Text>
              )}
            </Pressable>
          );
        }}
      />
      {openTicket !== null && (
        <TicketSheet ticket={openTicket} tickets={tickets} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
