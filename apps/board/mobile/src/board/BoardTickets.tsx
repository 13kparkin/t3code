import { newestAgent, ticketStatus } from "@agent-board/app/board/ticketStatus";
import {
  missingPlan,
  parseTickets,
  TICKET_STAGES,
  type Ticket,
} from "@agent-board/app/domain/ticket";
import { waitingOn } from "@agent-board/app/domain/ticketOverlay";
import { joinBoard } from "@agent-board/app/state/boardModel";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import * as Result from "effect/Result";
import { useMemo, useState } from "react";
import { Pressable, SectionList, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { CardLine } from "./CardLine";
import { familyThreadsAtom, useFamilyMount } from "./family";
import { type BoardChoice, useBoardFiles } from "./files";
import { StageTag } from "./StageTag";
import { TicketSheet } from "./TicketSheet";

// An agent waiting on its children turns Idle after a few minutes, so the cards recheck each minute.
const clockAtom = Atom.make((get): number => {
  const timer = setInterval(() => get.refreshSelf(), 60_000);
  get.addFinalizer(() => clearInterval(timer));
  return Date.now();
}).pipe(Atom.withLabel("phone-board-clock"));

const NO_TICKETS: ReadonlyArray<Ticket> = [];

export function BoardTickets({ choice }: { choice: BoardChoice }) {
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
  const rootId = choice.listed.ok ? choice.listed.board.orchestratorThreadId : null;
  useFamilyMount(rootId);
  const threads = useAtomValue(familyThreadsAtom(choice.project.environmentId));
  const now = useAtomValue(clockAtom);
  const cards = useMemo(() => {
    const model =
      rootId === null || threads === undefined
        ? null
        : joinBoard({
            tickets,
            family: threads.filter((thread) => thread.lineage.rootThreadId === rootId),
            orchestratorThreadId: rootId,
            driverOf: () => null,
          });
    return new Map(
      Object.values(model?.lanes ?? {})
        .flat()
        .map(({ ticket, agents }) => [
          ticket.key,
          { status: ticketStatus(agents, now), newest: newestAgent(agents) },
        ]),
    );
  }, [tickets, threads, rootId, now]);
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
    return <AppText style={styles.body}>Reading the board</AppText>;
  }
  return (
    <>
      {Result.isFailure(parsed) && (
        <View accessibilityRole="alert" style={styles.banner}>
          <AppText style={[styles.error, styles.bold]}>
            tickets.json has a bad {parsed.failure.fields.length === 1 ? "field" : "fields"}
            {parsed.failure.fields.length > 0 ? `: ${parsed.failure.fields.join(", ")}` : ""}.
            Showing the last valid layout.
          </AppText>
          <AppText style={[styles.error, styles.small]}>{parsed.failure.message}</AppText>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(ticket) => ticket.key}
        style={styles.readable}
        contentContainerStyle={styles.body}
        ListEmptyComponent={<AppText style={styles.muted}>This board has no tickets.</AppText>}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <StageTag stage={section.stage} />
            <AppText style={[styles.small, styles.faint]}>{section.data.length}</AppText>
          </View>
        )}
        renderItem={({ item }) => {
          const card = cards.get(item.key);
          const waiting =
            item.stage === "merged" || item.stage === "off_path" ? [] : waitingOn(item, tickets);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.key} ${item.title}`}
              onPress={() => setOpen(item.key)}
              style={styles.card}
            >
              <CardLine
                tag={item.key}
                title={item.title}
                status={card?.status ?? null}
                detail={
                  <>
                    <StageTag stage={item.stage} />{" "}
                    {waiting.length > 0 && (
                      <AppText style={styles.warn}>{`Waiting on ${waiting.join(", ")} · `}</AppText>
                    )}
                    {missingPlan(item) && <AppText style={styles.warn}>No plan · </AppText>}
                    {card?.newest === undefined ? "No agents" : card.newest.role}
                  </>
                }
              />
            </Pressable>
          );
        }}
      />
      {openTicket !== null && (
        <TicketSheet
          ticket={openTicket}
          tickets={tickets}
          decisions={decisions}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
