import type { RunId } from "@t3tools/contracts";

import { type PendingSend, type TimelineSource, userText } from "./timeline";

/** A message that has not reached the orchestrator's turn yet, as the strip above the input lists it. */
export interface QueueRow {
  readonly key: string;
  readonly messageId: string;
  readonly text: string;
  readonly delivery: "sending" | "queued" | "steering";
  /** The engine's queued run, which is what deleting the message cancels. */
  readonly runId: RunId | null;
}

/**
 * The messages the engine holds as queued or steering, then the sends it has not echoed yet.
 * `runIds` maps a queued message's id to its run.
 */
export function queueRows(
  source: TimelineSource,
  runIds: ReadonlyMap<string, RunId>,
  sends: ReadonlyArray<PendingSend>,
): ReadonlyArray<QueueRow> {
  const held = source.items.flatMap((item): QueueRow[] =>
    item.kind === "user" && (item.delivery === "queued" || item.delivery === "steering")
      ? [
          {
            key: item.messageId,
            messageId: item.messageId,
            text: userText(source, item),
            delivery: item.delivery,
            runId: runIds.get(item.messageId) ?? null,
          },
        ]
      : [],
  );
  const unechoed = sends.flatMap((send): QueueRow[] =>
    send.state.kind === "sending"
      ? [
          {
            key: send.messageId,
            messageId: send.messageId,
            text: send.text,
            delivery: "sending",
            runId: null,
          },
        ]
      : [],
  );
  return [...held, ...unechoed];
}

/** What deleting a row does: cancel the engine's queued run, drop the send, or nothing for a steer the turn already holds. */
export const cancelTarget = (
  row: QueueRow,
): { readonly kind: "run"; readonly runId: RunId } | { readonly kind: "local" } | null => {
  if (row.delivery === "sending") return { kind: "local" };
  return row.delivery === "queued" && row.runId !== null ? { kind: "run", runId: row.runId } : null;
};
