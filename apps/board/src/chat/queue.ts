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
 * The engine's queued runs, its steering messages, then the sends it has not echoed yet. A queued
 * run has no thread item until it starts, so the runs come from `queued`, not from the items.
 */
export function queueRows(
  source: TimelineSource,
  queued: ReadonlyArray<{ messageId: string; text: string; runId: RunId }>,
  sends: ReadonlyArray<PendingSend>,
  live: boolean,
): ReadonlyArray<QueueRow> {
  const held = queued.map((run): QueueRow => ({
    key: run.messageId,
    messageId: run.messageId,
    text: run.text,
    delivery: "queued",
    runId: run.runId,
  }));
  // A steer the finished turn took is no longer waiting, though the engine keeps it pending.
  const steering = source.items.flatMap((item): QueueRow[] =>
    live && item.kind === "user" && item.delivery === "steering"
      ? [
          {
            key: item.messageId,
            messageId: item.messageId,
            text: userText(source, item),
            delivery: "steering",
            runId: null,
          },
        ]
      : [],
  );
  const unechoed = sends.flatMap((send): QueueRow[] =>
    send.state.kind === "sending" && !queued.some((run) => run.messageId === send.messageId)
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
  return [...held, ...steering, ...unechoed];
}

/** What deleting a row does: cancel the engine's queued run, drop the send, or nothing for a steer the turn already holds. */
export const cancelTarget = (
  row: QueueRow,
): { readonly kind: "run"; readonly runId: RunId } | { readonly kind: "local" } | null => {
  if (row.delivery === "sending") return { kind: "local" };
  return row.delivery === "queued" && row.runId !== null ? { kind: "run", runId: row.runId } : null;
};
