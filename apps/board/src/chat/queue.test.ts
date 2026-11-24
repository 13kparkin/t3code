import { describe, expect, it } from "vite-plus/test";

import { MessageId, RunId } from "@t3tools/contracts";

import { NO_PICK } from "../providers/providers";
import { cancelTarget, queueRows } from "./queue";
import type { ChatItem, PendingSend } from "./timeline";

const item = (
  messageId: string,
  text: string,
  delivery: "queued" | "steering" | "delivered",
): ChatItem => ({
  kind: "user",
  id: `i-${messageId}`,
  messageId,
  text,
  textOmitted: false,
  delivery,
});

const send = (
  messageId: string,
  state: PendingSend["state"] = { kind: "sending" },
): PendingSend => ({
  threadId: "t1",
  messageId: MessageId.make(messageId),
  text: `send ${messageId}`,
  files: [],
  fresh: false,
  shown: NO_PICK,
  overridden: false,
  state,
});

const source = (items: ReadonlyArray<ChatItem>) => ({ runs: [], messages: [], items });

describe("the messages waiting above the input", () => {
  it("Given a queued run the thread has no item for yet, a steering message, a delivered one and unechoed sends, when rows are read, then each waiting one has its delivery and run id and a queued send is not listed twice", () => {
    const rows = queueRows(
      source([item("m2", "now", "steering"), item("m3", "done", "delivered")]),
      [{ messageId: "m1", text: "later", runId: RunId.make("run-1") }],
      [send("m1"), send("m4"), send("m5", { kind: "failed", error: "Offline" })],
    );
    expect(rows).toEqual([
      { key: "m1", messageId: "m1", text: "later", delivery: "queued", runId: RunId.make("run-1") },
      { key: "m2", messageId: "m2", text: "now", delivery: "steering", runId: null },
      { key: "m4", messageId: "m4", text: "send m4", delivery: "sending", runId: null },
    ]);
  });

  it.each([
    [
      { key: "a", messageId: "a", text: "", delivery: "queued", runId: RunId.make("run-1") },
      { kind: "run", runId: RunId.make("run-1") },
    ],
    [{ key: "a", messageId: "a", text: "", delivery: "sending", runId: null }, { kind: "local" }],
    [{ key: "a", messageId: "a", text: "", delivery: "steering", runId: null }, null],
  ] as const)("Given row %o, when deleting it, then the target is %o", (row, target) => {
    expect(cancelTarget(row)).toEqual(target);
  });
});
