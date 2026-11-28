import { useState } from "react";

import { lockedFields } from "../domain/ticketOverlay";
import type { Ticket } from "../domain/ticket";
import { Tooltip } from "../ui/Tooltip";
import { useTicketActions } from "./useTicketActions";

/** On the full page the title sits inside the page's own heading and wraps instead of truncating. */
export function TicketTitle({ ticket, page = false }: { ticket: Ticket; page?: boolean }) {
  const { edit } = useTicketActions(ticket);
  const [draft, setDraft] = useState<string | null>(null);
  const locked = lockedFields(ticket).has("title");
  const save = () => {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (next !== "" && next !== ticket.title) void edit({ title: next });
  };
  const Heading = page ? "span" : "h3";
  return (
    <Heading
      className={
        page
          ? "flex min-w-0 items-baseline gap-2"
          : "flex min-w-0 flex-1 items-center gap-1.5 font-semibold"
      }
    >
      <span className="shrink-0">{ticket.key}</span>
      {draft === null ? (
        <Tooltip text={locked ? "Held by the tracker" : "Rename"} side="bottom" align="start">
          <button
            type="button"
            data-testid="ticket-title"
            disabled={locked}
            onClick={() => setDraft(ticket.title)}
            className={`min-w-0 text-left enabled:hover:text-muted ${page ? "break-words" : "truncate"}`}
          >
            {ticket.title}
          </button>
        </Tooltip>
      ) : (
        <input
          autoFocus
          data-testid="ticket-title-input"
          aria-label="Ticket title"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(null);
          }}
          className="min-w-0 flex-1 rounded border border-focus bg-transparent px-1 font-semibold outline-none"
        />
      )}
    </Heading>
  );
}
