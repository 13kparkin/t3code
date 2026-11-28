import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "../domain/ticket";
import type { AgentView, BoardModel } from "./boardModel";
import {
  agentLane,
  agentRowCounts,
  archivedBesideLanes,
  findTicketView,
  folderArchived,
  runningItems,
  splitCards,
} from "./cardStates";

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
      { ticket: ticket("T-1"), position: 0, agents: [] },
      { ticket: ticket("T-2"), position: 1, agents: [] },
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
      todo: split.agents.todo.map((entry) => entry.threadId),
      free: split.free.map((entry) => entry.threadId),
      doneAgents: split.agents.done.map((entry) => entry.threadId),
      doneFree: split.doneFree.map((entry) => entry.threadId),
      archived: split.archived,
    }).toEqual({
      tickets: ["T-1"],
      todo: ["a-live"],
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
    { name: "running", extra: { ...ran, runState: "working" }, state: undefined, lane: "running" },
    { name: "finished", extra: ran, state: undefined, lane: "done" },
    { name: "cancelled", extra: { ...ran, runState: "stopped" }, state: undefined, lane: "done" },
    { name: "failed", extra: { ...ran, runState: "failed" }, state: undefined, lane: "done" },
    { name: "asking", extra: { ...ran, pendingRequest: true }, state: undefined, lane: "waiting" },
    {
      name: "waiting on children",
      extra: { ...ran, waitingOnChildren: true },
      state: undefined,
      lane: "running",
    },
    { name: "finished, moved out of Done", extra: ran, state: "todo", lane: "waiting" },
    {
      name: "running, moved out of Done",
      extra: { ...ran, runState: "working" },
      state: "todo",
      lane: "running",
    },
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

  it("Given a running, an asking and a finished agent with no saved state, when split, then each sits in its lane and Done also counts the free agents there", () => {
    const split = splitCards(
      {
        ...model,
        unassigned: [
          agent("run", { ...ran, runState: "working" }),
          agent("ask", { ...ran, pendingRequest: true }),
          agent("end", ran),
        ],
      },
      free,
      { "f-done": "done" },
      0,
    );
    expect([
      Object.values(split.agents).map((rows) => rows.map((entry) => entry.threadId)),
      agentRowCounts(split),
    ]).toEqual([[[], ["run"], ["ask"], ["end"]], { todo: 0, running: 1, waiting: 1, done: 2 }]);
  });
});

describe("cards archived beside the lanes", () => {
  const states = {
    c1: "archived",
    "file:brief.md": "archived",
    "dir:artifacts/board": "archived",
    "take:c2/2026-11-26T10:00:00.000Z/them.wav": "archived",
    "file:kept.md": "todo",
  } as const;

  it("Given archived calls, files, folders, and take files, then each is listed by its name", () => {
    const calls = [
      { id: "c1", title: "Design sync", start: "2026-11-26T10:00:00.000Z", app: "chrome" },
    ] as const;
    expect(archivedBesideLanes(calls, states).map((card) => card.label)).toEqual([
      "Design sync",
      "brief.md",
      "board",
      "them.wav",
    ]);
  });

  it.each([
    ["the archived folder", "artifacts/board", true],
    ["a folder inside it", "artifacts/board/runs", true],
    ["its parent", "artifacts", false],
    ["a folder whose name only starts the same", "artifacts/boards", false],
  ])("Given %s, then its section hides: %s", (_name, path, hidden) => {
    expect(folderArchived(states, path)).toBe(hidden);
  });
});

describe("the Running lane's items", () => {
  it("Given live and idle tickets and agents, then it lists live agents first, then live unfinished tickets by position, and an idle ticket is still found when opened", () => {
    const live = { latestRunId: "run-1", runState: "working" } as const;
    const lanes = {
      ...model.lanes,
      building: [
        { ticket: ticket("T-1"), position: 0, agents: [agent("t1", live)] },
        { ticket: ticket("T-2"), position: 1, agents: [agent("t2")] },
      ],
      pr: [
        {
          ticket: { ...ticket("T-3"), stage: "pr" as const },
          position: 2,
          agents: [agent("t3", live)],
        },
      ],
      merged: [
        {
          ticket: { ...ticket("T-4"), stage: "merged" as const },
          position: 3,
          agents: [agent("t4", live)],
        },
      ],
    };
    const split = splitCards(
      { lanes, unassigned: [agent("free-live", live), agent("free-idle")] },
      [],
      {},
      0,
    );
    expect(
      runningItems(split, 0).map((item) =>
        item.kind === "agent" ? item.agent.threadId : item.view.ticket.key,
      ),
    ).toEqual(["free-live", "T-3", "T-1"]);
    expect(findTicketView(split.model, "T-2")?.ticket.key).toBe("T-2");
  });
});
