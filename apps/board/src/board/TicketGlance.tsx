import { useMemo } from "react";

import { lineText } from "../domain/additions";
import { glanceLines } from "../domain/glance";
import { usePrContext, useTicketPr, useTicketSmoke } from "../state/prStatus";
import type { SectionProps } from "./sectionProps";

export function TicketGlance({ view }: SectionProps) {
  const { tickets, decisions, additions } = usePrContext();
  const size = useTicketPr(view).live?.size ?? null;
  const smoke = useTicketSmoke(view);
  const lines = useMemo(() => {
    const all = tickets.map((entry) => entry.ticket);
    const added = additions.flatMap((item) =>
      item.place === "glance" && item.ticket === view.ticket.key
        ? [{ label: item.title, text: lineText(item, all) }]
        : [],
    );
    return [
      ...glanceLines({ ticket: view.ticket, tickets: all, size, smoke, decisions }),
      ...added,
    ];
  }, [view.ticket, tickets, size, smoke, decisions, additions]);
  if (lines.length === 0) return <p className="text-faint">Nothing yet</p>;
  return (
    <dl data-testid="ticket-glance" className="flex flex-col gap-1">
      {lines.map(({ label, text }) => (
        <div key={label} data-line={label} className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted">{label}</dt>
          <dd className="min-w-0 flex-1 break-words text-fg">{text}</dd>
        </div>
      ))}
    </dl>
  );
}
