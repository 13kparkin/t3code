import type { SectionProps } from "./sectionProps";

export function TicketSummary({ view }: SectionProps) {
  return (
    <p data-testid="ticket-summary" className="break-words text-fg">
      {view.ticket.summary}
    </p>
  );
}
