import { TICKET_STAGES, type Ticket, type TicketStage } from "@agent-board/app/domain/ticket";

const NOT_IN_PROGRESS: ReadonlySet<TicketStage> = new Set([
  "todo",
  "planned",
  "merged",
  "off_path",
]);

export function summarize(tickets: ReadonlyArray<Ticket>) {
  return {
    total: tickets.length,
    inProgress: tickets.filter((ticket) => !NOT_IN_PROGRESS.has(ticket.stage)).length,
    byStage: new Map(
      TICKET_STAGES.map((stage) => [
        stage,
        tickets.filter((ticket) => ticket.stage === stage).length,
      ]),
    ),
  };
}
