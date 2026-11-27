import { cardViews, type ForYouAnswer, mergeForYou } from "@agent-board/app/domain/forYou";
import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { answerItem, type ForYouEngine, forYouSentAtom } from "./actions";

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

function setup(sendFailure: string | null = null) {
  const calls: Array<string> = [];
  const engine: ForYouEngine = {
    message: async (text) => {
      calls.push(`message: ${text}`);
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
  const registry = AtomRegistry.make();
  const target = { registry, engine, boardKey: "/repo/.agentboard/board", projectId: "p1" };
  const cards = mergeForYou(FILE, []).cards;
  const answer = (id: string, choice: ForYouAnswer) => {
    const card = cards.find((entry) => entry.id === id);
    if (card?.origin !== "file") throw new Error(`no file card ${id}`);
    return answerItem(target, card, choice);
  };
  const stateOf = (id: string) =>
    cardViews(cards, registry.get(forYouSentAtom)[target.boardKey] ?? new Map()).find(
      (view) => view.card.id === id,
    )?.state;
  return { calls, answer, stateOf };
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
    const board = setup("Connection lost.");
    expect(await board.answer("m1", { type: "choice", choice: "approve" })).toBe(
      "Connection lost.",
    );
    expect(board.stateOf("m1")).toBe("open");
  });
});
