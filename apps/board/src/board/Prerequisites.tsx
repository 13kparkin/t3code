import { Plus, X } from "lucide-react";

import { STAGE_LABEL } from "../domain/ticket";
import { waitingOn, wouldCycle } from "../domain/ticketOverlay";
import { usePrContext } from "../state/prStatus";
import { PopMenu } from "../ui/PopMenu";
import type { SectionProps } from "./sectionProps";
import { useTicketActions } from "./useTicketActions";

/** What the ticket waits on, which the user adds to and removes from, and what waits on it. A prerequisite that would close a loop is offered but off. */
export function Prerequisites({ view }: SectionProps) {
  const { ticket } = view;
  const all = usePrContext().tickets.map((entry) => entry.ticket);
  const { edit, error } = useTicketActions(ticket);
  const deps = ticket.dependsOn ?? [];
  const waiting = new Set(waitingOn(ticket, all));
  const blocks = all.filter((entry) => entry.dependsOn?.includes(ticket.key) === true);
  const candidates = all.filter((entry) => entry.key !== ticket.key && !deps.includes(entry.key));
  const stateOf = (key: string) => {
    const found = all.find((entry) => entry.key === key);
    return found === undefined ? "Unknown" : STAGE_LABEL[found.stage];
  };
  const label = (key: string) => {
    const found = all.find((entry) => entry.key === key);
    return found === undefined ? `${key} (no such ticket)` : `${key} ${found.title}`;
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid="prerequisites">
      <ul className="flex flex-col gap-1">
        {deps.map((key) => (
          <li key={key} data-prerequisite={key} className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-fg">{label(key)}</span>
            <span className={waiting.has(key) ? "text-amber-300" : "text-emerald-300"}>
              {stateOf(key)}
            </span>
            <button
              type="button"
              aria-label={`Remove ${key} as a prerequisite`}
              onClick={() => void edit({ dependsOn: deps.filter((dep) => dep !== key) })}
              className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
        {deps.length === 0 && <li className="text-faint">Waits on nothing</li>}
      </ul>
      {candidates.length > 0 && (
        <PopMenu
          label="Add a prerequisite"
          align="start"
          triggerClass="inline-flex w-fit items-center gap-1 rounded border border-line px-1.5 leading-5 text-muted hover:bg-hover hover:text-fg"
          trigger={
            <>
              <Plus className="size-3" aria-hidden />
              Add prerequisite
            </>
          }
          items={candidates.map((entry) => {
            const loop = wouldCycle(all, ticket.key, [...deps, entry.key]);
            return {
              label: `${entry.key} ${entry.title}`,
              hint: loop === null ? undefined : `Cycle: ${loop.join(" → ")}`,
              disabled: loop !== null,
              onSelect: () => void edit({ dependsOn: [...deps, entry.key] }),
            };
          })}
        />
      )}
      {blocks.length > 0 && (
        <p className="text-muted">Blocks: {blocks.map((entry) => entry.key).join(", ")}</p>
      )}
      {error !== null && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
