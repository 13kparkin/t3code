import { missingPlan, type Ticket } from "@agent-board/app/domain/ticket";
import { waitingOn } from "@agent-board/app/domain/ticketOverlay";
import type { TicketView } from "@agent-board/app/state/boardModel";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { CardLine } from "./CardLine";
import { cardStatus } from "./useBoardModel";

export function RunningTicket({
  view,
  tickets,
  now,
}: {
  view: TicketView;
  tickets: ReadonlyArray<Ticket>;
  now: number;
}) {
  const { ticket } = view;
  const card = cardStatus(view.agents, now);
  const waiting = waitingOn(ticket, tickets);
  return (
    <CardLine
      tag={ticket.key}
      stage={ticket.stage}
      title={ticket.title}
      status={card.status}
      detail={
        <>
          {waiting.length > 0 && (
            <AppText style={styles.warn}>{`Waiting on ${waiting.join(", ")} · `}</AppText>
          )}
          {missingPlan(ticket) && <AppText style={styles.warn}>No plan · </AppText>}
          {card.newest === undefined ? "No agents" : card.newest.role}
        </>
      }
    />
  );
}
