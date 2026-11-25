import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "../domain/ticket";
import type { AgentView, BoardModel } from "./boardModel";
import { splitCards } from "./cardStates";

const agent = (threadId: string): AgentView => ({
  threadId,
  title: `title ${threadId}`,
  role: "task",
  registered: true,
  outsideRegistry: false,
  ticketKey: null,
  driver: null,
  runState: "idle",
  pendingRequest: false,
  waitingOnChildren: false,
  latestRunId: null,
  branch: null,
  parentThreadId: null,
  round: null,
  updatedAt: "2026-11-20T10:00:00.000Z",
});
const ticket = (key: string): Ticket => ({ key, title: key.toLowerCase(), stage: "building" });
const model: BoardModel = {
  lanes: {
    todo: [],
    planned: [],
    building: [
      { ticket: ticket("T-1"), agents: [] },
      { ticket: ticket("T-2"), agents: [] },
    ],
    reviewing: [],
    verifying: [],
    pr: [],
    awaiting_approval: [],
    merged: [],
    off_path: [],
  },
  unassigned: [agent("a-live"), agent("a-done"), agent("a-gone")],
};
const free = [
  { threadId: "f-live", x: 1, y: 2 },
  { threadId: "f-done", x: 3, y: 4 },
  { threadId: "f-gone-0123456789", x: 5, y: 6 },
];

describe("splitting cards by their saved state", () => {
  it("Given a done and an archived card of each kind, when split, then each lands in one place only", () => {
    const split = splitCards(model, free, {
      "T-2": "archived",
      "a-done": "done",
      "a-gone": "archived",
      "f-done": "done",
      "f-gone-0123456789": "archived",
    });
    expect({
      tickets: split.model.lanes.building.map((view) => view.ticket.key),
      unassigned: split.model.unassigned.map((entry) => entry.threadId),
      free: split.free.map((entry) => entry.threadId),
      doneAgents: split.done.agents.map((entry) => entry.threadId),
      doneFree: split.done.free.map((entry) => entry.threadId),
      archived: split.archived,
    }).toEqual({
      tickets: ["T-1"],
      unassigned: ["a-live"],
      free: ["f-live"],
      doneAgents: ["a-done"],
      doneFree: ["f-done"],
      archived: [
        { key: "T-2", label: "T-2 t-2" },
        { key: "a-gone", label: "title a-gone" },
        { key: "f-gone-0123456789", label: "Agent 23456789" },
      ],
    });
  });
});
