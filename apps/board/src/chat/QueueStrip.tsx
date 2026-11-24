import { CornerDownRight, X } from "lucide-react";

import { Tooltip } from "../ui/Tooltip";
import type { QueueRow } from "./queue";

const LABEL = { sending: "Sending", queued: "Queued", steering: "Steering" } as const;
const STEER_LOCKED = "The running turn already has this message, so it can no longer be deleted.";

/** The messages that have not reached the orchestrator's turn yet, above the input. Each can be deleted until it is read. */
export function QueueStrip({
  rows,
  canSteer,
  onDelete,
  onSteer,
}: {
  rows: ReadonlyArray<QueueRow>;
  canSteer: boolean;
  onDelete: (row: QueueRow) => void;
  onSteer: (row: QueueRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <ul
      aria-label="Messages waiting to be sent"
      data-testid="queue-strip"
      className="flex flex-col gap-1 rounded-xl border border-line bg-panel p-1.5 shadow-panel"
    >
      {rows.map((row) => (
        <li
          key={row.key}
          data-delivery={row.delivery}
          className="flex items-center gap-2 px-1.5 text-muted"
        >
          {row.delivery === "steering" ? (
            <Tooltip text={STEER_LOCKED} side="top" align="start">
              <span tabIndex={0} className="shrink-0 text-[11px] text-fg">
                {LABEL.steering}
              </span>
            </Tooltip>
          ) : (
            <span className="shrink-0 text-[11px] text-faint">{LABEL[row.delivery]}</span>
          )}
          <span className="min-w-0 flex-1 truncate text-fg">{row.text}</span>
          {row.delivery === "queued" && canSteer && row.runId !== null && (
            <button
              type="button"
              onClick={() => onSteer(row)}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-5 hover:bg-hover hover:text-fg"
            >
              <CornerDownRight className="size-3" aria-hidden />
              Steer now
            </button>
          )}
          {row.delivery !== "steering" && (
            <button
              type="button"
              aria-label={`Delete ${row.delivery === "sending" ? "unsent" : "queued"} message`}
              onClick={() => onDelete(row)}
              className="grid size-5 shrink-0 place-items-center rounded-md hover:bg-hover hover:text-fg"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
