import type { RunId } from "@t3tools/contracts";

import { type PendingSend, type TimelineSource, userText } from "./timeline";

export interface QueueRow {
  readonly key: string;
  readonly messageId: string;
  readonly text: string;
  readonly delivery: "sending" | "queued" | "steering";
  readonly runId: RunId | null;
}

/** A queued run has no thread item until it starts, so its rows come from `queued`, not from the items. */
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

export const cancelTarget = (
  row: QueueRow,
): { readonly kind: "run"; readonly runId: RunId } | { readonly kind: "local" } | null => {
  if (row.delivery === "sending") return { kind: "local" };
  return row.delivery === "queued" && row.runId !== null ? { kind: "run", runId: row.runId } : null;
};
