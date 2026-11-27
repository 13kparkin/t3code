import { cardViews, type ForYouAnswer, mergeForYou } from "@agent-board/app/domain/forYou";
import { EnvironmentId } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  answerItem,
  boardSent,
  type ForYouEngine,
  forgetSettledWrites,
  forYouSentAtom,
  sentWritesAtom,
} from "./actions";

const met = { met: true };
const FILE = [
  {
    id: "m1",
    kind: "merge_approval",
    title: "Merge T-1",
    body: "",
    status: "open",
    createdAt: "2026-11-27T10:00:00Z",
    conditions: {
      ci_green: met,
      reviews_fixed: met,
      delta_rereviewed: met,
      readmes_pass: met,
      parent_ready: met,
      smoke_named: met,
    },
  },
  {
    id: "q1",
    kind: "question",
    title: "Which plan?",
    body: "",
    status: "open",
    createdAt: "2026-11-27T10:00:00Z",
    options: ["A", "B"],
  },
  {
    id: "t1",
    kind: "tracker_write",
    title: "Close #12",
    body: "",
    status: "open",
    createdAt: "2026-11-27T10:00:00Z",
    write: { tracker: "github", scope: "o/r", action: "set_state", key: "#12", state: "closed" },
  },
]
  .map((item) => JSON.stringify(item))
  .join("\n");

const saved = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => {
    saved.set(key, value);
  },
}));

function setup({
  notReady = null,
  sendFailure = null,
}: { notReady?: string | null; sendFailure?: string | null } = {}) {
  const calls: Array<string> = [];
  const engine: ForYouEngine = {
    message: async (text) => {
      if (notReady !== null) return notReady;
      calls.push(`message: ${await text()}`);
      return sendFailure;
    },
    respondApproval: async (request, decision) => {
      calls.push(`respond: ${request.id} ${decision}`);
      return null;
    },
    trackerCall: async (call) => {
      calls.push(`tracker: ${call.operation}`);
      return `Moved ${call.operation === "setState" ? call.input.key : ""} to "closed"`;
    },
  };
  saved.clear();
  const launch = (file = FILE) => {
    const registry = AtomRegistry.make();
    const target = {
      registry,
      engine,
      environmentId: EnvironmentId.make("e1"),
      boardKey: "/repo/.agentboard/board",
      projectId: "p1",
    };
    const cards = mergeForYou(file, []).cards;
    const answer = (id: string, choice: ForYouAnswer) => {
      const card = cards.find((entry) => entry.id === id);
      if (card?.origin !== "file") throw new Error(`no file card ${id}`);
      return answerItem(target, card, choice);
    };
    const sent = () =>
      boardSent(registry.get(forYouSentAtom), registry.get(sentWritesAtom), target.boardKey, cards);
    const stateOf = (id: string) =>
      cardViews(cards, sent()).find((view) => view.card.id === id)?.state;
    const forgetSettled = () => forgetSettledWrites(registry, target.boardKey, cards);
    return { answer, stateOf, forgetSettled };
  };
  return { calls, ...launch(), relaunch: launch };
}

describe("answerItem", () => {
  it.each([
    ["m1", { type: "choice", choice: "approve" }, "For you item m1: approve"],
    ["m1", { type: "choice", choice: "hold" }, "For you item m1: hold"],
    ["q1", { type: "text", text: "Use plan B" }, "For you item q1: answer: Use plan B"],
  ] as const)("sends only the orchestrator message for %s %j", async (id, choice, message) => {
    const board = setup();
    expect(await board.answer(id, choice)).toBeNull();
    expect(board.calls).toEqual([`message: ${message}`]);
    expect(board.stateOf(id)).toBe("sent");
  });

  it("makes the tracker change on approve and sends its outcome", async () => {
    const board = setup();
    expect(await board.answer("t1", { type: "choice", choice: "approve" })).toBeNull();
    expect(board.calls).toEqual([
      "tracker: setState",
      'message: For you item t1: approve\nResult: Moved 12 to "closed"',
    ]);
  });

  it("returns the card to open with the failure text when the message does not go", async () => {
    const board = setup({ sendFailure: "Connection lost." });
    expect(await board.answer("m1", { type: "choice", choice: "approve" })).toBe(
      "Connection lost.",
    );
    expect(board.stateOf("m1")).toBe("open");
  });

  it("keeps a card Sent when its tracker change was made but the message did not go", async () => {
    const board = setup({ sendFailure: "Connection lost." });
    expect(await board.answer("t1", { type: "choice", choice: "approve" })).toBe(
      'Connection lost. The tracker change was already made: Moved 12 to "closed"',
    );
    expect(board.stateOf("t1")).toBe("sent");
  });

  it("makes no tracker change when the orchestrator cannot take the message", async () => {
    const board = setup({ notReady: "Start this board's orchestrator before answering." });
    expect(await board.answer("t1", { type: "choice", choice: "approve" })).toBe(
      "Start this board's orchestrator before answering.",
    );
    expect(board.calls).toEqual([]);
    expect(board.stateOf("t1")).toBe("open");
  });

  it("still shows a made tracker change as Sent after a relaunch", async () => {
    const board = setup();
    await board.answer("t1", { type: "choice", choice: "approve" });
    expect(board.relaunch().stateOf("t1")).toBe("sent");
  });

  it("forgets a made tracker change once the file records it", async () => {
    const board = setup();
    await board.answer("t1", { type: "choice", choice: "approve" });
    const recorded = board.relaunch(`${FILE}\n{"id":"t1","status":"resolved"}`);
    recorded.forgetSettled();
    expect(recorded.stateOf("t1")).toBe("resolved");
    expect(board.relaunch().stateOf("t1")).toBe("open");
  });
});
