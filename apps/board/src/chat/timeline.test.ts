import { describe, expect, it } from "vite-plus/test";

import { MessageId } from "@t3tools/contracts";

import { userDelivery } from "./projectionSource";
import {
  type ChatItem,
  isRunLive,
  type PendingSend,
  pendingRow,
  pendingSends,
  timelineRows,
  type ToolStep,
} from "./timeline";

const source = (
  items: ReadonlyArray<ChatItem>,
  runs: ReadonlyArray<{ id: string; status: string; startedAt?: number | null }> = [],
  messages: ReadonlyArray<{ id: string; text: string; createdAt?: number }> = [],
) => ({
  runs: runs.map((run) => ({ startedAt: null, ...run })),
  messages: messages.map((message) => ({ createdAt: 0, ...message })),
  items,
});

const step = (id: string, label: string, running = false): ToolStep => ({
  id,
  label,
  running,
  failed: false,
  family: "tool",
  input: null,
  exitCode: null,
  file: null,
  output: null,
  outputRef: null,
});

const tool = (id: string, label: string, running = false): ChatItem => ({
  kind: "tool",
  ...step(id, label, running),
});

describe("the chat rows of a thread", () => {
  it("Given a brief the engine left out, when the rows are built, then its text comes from the thread's messages", () => {
    const rows = timelineRows(
      source(
        [
          {
            kind: "user",
            id: "i1",
            messageId: "m1",
            text: "",
            textOmitted: true,
            delivery: "delivered",
          },
        ],
        [],
        [{ id: "m1", text: "You are this board's orchestrator" }],
      ),
    );
    expect(rows).toEqual([
      {
        kind: "user",
        id: "i1",
        text: "You are this board's orchestrator",
        at: 0,
        delivery: "delivered",
      },
    ]);
  });

  it("Given tool calls between two replies, when the rows are built, then each stretch folds into one work row", () => {
    const rows = timelineRows(
      source([
        {
          kind: "assistant",
          id: "a1",
          messageId: "m1",
          runId: null,
          text: "Planning.",
          textOmitted: false,
          streaming: false,
        },
        tool("t1", "delegate_task"),
        tool("t2", "$ ls .agentboard", true),
        {
          kind: "assistant",
          id: "a2",
          messageId: "m2",
          runId: null,
          text: "Done.",
          textOmitted: false,
          streaming: true,
        },
      ]),
    );
    expect(rows.map((row) => row.kind)).toEqual(["assistant", "work", "assistant"]);
    expect(rows[1]).toEqual({
      kind: "work",
      id: "t1",
      steps: [step("t1", "delegate_task"), step("t2", "$ ls .agentboard", true)],
    });
  });

  it("Given an empty reply that is still streaming, when the rows are built, then the row is kept for its first token", () => {
    const rows = timelineRows(
      source([
        {
          kind: "assistant",
          id: "a1",
          messageId: "m1",
          runId: null,
          text: "",
          textOmitted: false,
          streaming: true,
        },
      ]),
    );
    expect(rows).toEqual([
      { kind: "assistant", id: "a1", text: "", streaming: true, at: null, turnStartedAt: null },
    ]);
  });

  it("Given a reply the thread timestamped in a run that started, when the rows are built, then the row carries the message time and the turn start", () => {
    const rows = timelineRows(
      source(
        [
          {
            kind: "assistant",
            id: "a1",
            messageId: "m1",
            runId: "r1",
            text: "Working.",
            textOmitted: false,
            streaming: true,
          },
        ],
        [{ id: "r1", status: "running", startedAt: 1_000 }],
        [{ id: "m1", text: "Working.", createdAt: 2_500 }],
      ),
    );
    expect(rows).toEqual([
      {
        kind: "assistant",
        id: "a1",
        text: "Working.",
        streaming: true,
        at: 2_500,
        turnStartedAt: 1_000,
      },
    ]);
  });

  it("Given an interrupted run, when the rows are built, then the last row says Stopped", () => {
    const rows = timelineRows(source([], [{ id: "r1", status: "interrupted" }]));
    expect(rows).toEqual([{ kind: "notice", id: "r1:stopped", text: "Stopped", error: false }]);
  });

  it("Given a failed turn, when the rows are built, then the error shows as an error notice", () => {
    const rows = timelineRows(
      source([{ kind: "notice", id: "e1", text: "Claude gave up.", error: true }]),
    );
    expect(rows).toEqual([{ kind: "notice", id: "e1", text: "Claude gave up.", error: true }]);
  });
});

describe("whether a run is live", () => {
  it.each([
    ["running", true],
    ["starting", true],
    ["completed", false],
    ["interrupted", false],
  ])("Given a latest run that is %s, when it is read, then live is %s", (status, live) => {
    expect(isRunLive({ runs: [{ status }] })).toBe(live);
  });

  it("Given no run, when it is read, then it is not live", () => {
    expect(isRunLive({ runs: [] })).toBe(false);
  });
});

const pendingSend = (messageId: string, state: PendingSend["state"]): PendingSend => ({
  threadId: "t1",
  messageId: MessageId.make(messageId),
  text: "Ship it",
  files: [],
  fresh: false,
  state,
});

describe("the sends the engine has not echoed", () => {
  it("Given one send echoed and one not, when the pending sends are read, then only the unechoed one stays", () => {
    const echoed = pendingSend("m1", { kind: "sending" });
    const waiting = pendingSend("m2", { kind: "sending" });
    const kept = pendingSends(
      source([
        {
          kind: "user",
          id: "i1",
          messageId: "m1",
          text: "Ship it",
          textOmitted: false,
          delivery: "delivered",
        },
      ]),
      [echoed, waiting],
    );
    expect(kept).toEqual([waiting]);
  });

  it("Given no send echoed, when the pending sends are read, then the same list comes back", () => {
    const sends = [pendingSend("m1", { kind: "sending" })];
    expect(pendingSends(source([]), sends)).toBe(sends);
  });

  it("Given a send that failed, when it is drawn, then it is a failed user row", () => {
    expect(pendingRow(pendingSend("m1", { kind: "failed", error: "Offline" }))).toEqual({
      kind: "user",
      id: "m1",
      text: "Ship it",
      at: null,
      delivery: "failed",
    });
  });
});

describe("how a user message stands", () => {
  it.each([
    ["queued_turn", "queued"],
    ["steer", "steering"],
    ["promoted_queued_to_steer", "steering"],
    ["turn_start", "delivered"],
  ] as const)("Given a pending %s message, when it is read, then it is %s", (intent, delivery) => {
    expect(userDelivery({ status: "pending", inputIntent: intent })).toBe(delivery);
  });

  it("Given a queued message the engine has read, when it is read, then it is delivered", () => {
    expect(userDelivery({ status: "completed", inputIntent: "queued_turn" })).toBe("delivered");
  });
});
