import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "../domain/ticket";
import type { AgentView, BoardModel } from "./boardModel";
import { agentLane, splitCards } from "./cardStates";

const agent = (threadId: string, extra: Partial<AgentView> = {}): AgentView => ({
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
  ...extra,
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
    const split = splitCards(
      model,
      free,
      {
        "T-2": "archived",
        "a-done": "done",
        "a-gone": "archived",
        "f-done": "done",
        "f-gone-0123456789": "archived",
      },
      0,
    );
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

describe("an unclaimed agent's lane", () => {
  const ran = { latestRunId: "run-1" };
  it.each([
    { name: "never ran", extra: {}, state: undefined, lane: "todo" },
    { name: "running", extra: { ...ran, runState: "working" }, state: undefined, lane: "todo" },
    { name: "finished", extra: ran, state: undefined, lane: "done" },
    { name: "cancelled", extra: { ...ran, runState: "stopped" }, state: undefined, lane: "done" },
    { name: "failed", extra: { ...ran, runState: "failed" }, state: undefined, lane: "done" },
    { name: "asking", extra: { ...ran, pendingRequest: true }, state: undefined, lane: "todo" },
    {
      name: "waiting on children",
      extra: { ...ran, waitingOnChildren: true },
      state: undefined,
      lane: "todo",
    },
    { name: "finished, moved out of Done", extra: ran, state: "todo", lane: "todo" },
    {
      name: "running, moved to Done",
      extra: { ...ran, runState: "working" },
      state: "done",
      lane: "done",
    },
    { name: "finished, archived", extra: ran, state: "archived", lane: "archived" },
  ] as const)("Given $name, then it sits in $lane", ({ extra, state, lane }) => {
    expect(agentLane(agent("a", extra), state, 0)).toBe(lane);
  });

  it("Given a finished and a running agent with no saved state, when split, then only the finished one is in Done", () => {
    const split = splitCards(
      { ...model, unassigned: [agent("run", { ...ran, runState: "working" }), agent("end", ran)] },
      [],
      {},
      0,
    );
    expect({
      todo: split.model.unassigned.map((entry) => entry.threadId),
      done: split.done.agents.map((entry) => entry.threadId),
    }).toEqual({ todo: ["run"], done: ["end"] });
  });
});
