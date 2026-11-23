import { useMemo } from "react";

import { glanceLines } from "../domain/glance";
import { usePrContext, useTicketPr, useTicketSmoke } from "../state/prStatus";
import type { SectionProps } from "./sectionProps";

/** The ticket in plain one-liners: what it fixes, how big it is, how we know it works, and what it waits on. */
export function TicketGlance({ view }: SectionProps) {
  const { tickets, decisions } = usePrContext();
  const size = useTicketPr(view).live?.size ?? null;
  const smoke = useTicketSmoke(view);
  const lines = useMemo(
    () =>
      glanceLines({
        ticket: view.ticket,
        tickets: tickets.map((entry) => entry.ticket),
        size,
        smoke,
        decisions,
      }),
    [view.ticket, tickets, size, smoke, decisions],
  );
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
