import type { SectionProps } from "./sectionProps";

export function TicketWhy({ view }: SectionProps) {
  return (
    <p data-testid="ticket-why" className="break-words text-fg">
      {view.ticket.why ?? "No reason yet"}
    </p>
  );
}
