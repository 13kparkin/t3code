import { describe, expect, it } from "vite-plus/test";

import type { Addition } from "../domain/additions";
import type { Ticket } from "../domain/ticket";
import type { AgentView, BoardModel, TicketView } from "../state/boardModel";
import {
  clampDrag,
  DONE_AGENTS_KEY,
  FRAME_WIDTH,
  CARD_HEIGHT,
  FRAME_GAP,
  LANE_GAP,
  LANE_HEAD,
  LANE_MAX_HEIGHT,
  LANE_PAD,
  LANE_WIDTH,
  LANES_TOP,
  hiddenFilters,
  layoutBoard,
  laneCount,
  orderedKeys,
  reorderByDrag,
  ticketLane,
  besideLanes,
  UNASSIGNED_KEY,
} from "./layout";
import { isWorking, ticketStatus } from "./ticketStatus";

const agent = (threadId: string, runState: AgentView["runState"] = "idle"): AgentView => ({
  threadId,
  title: threadId,
  role: "task",
  registered: true,
  outsideRegistry: false,
  ticketKey: null,
  driver: null,
  runState,
  pendingRequest: false,
  waitingOnChildren: false,
  latestRunId: null,
  branch: null,
  parentThreadId: null,
  round: null,
  updatedAt: "2026-11-20T10:00:00.000Z",
});

const view = (
  ticket: Ticket,
  agents = 0,
  runState: AgentView["runState"] = "idle",
): TicketView => ({
  ticket,
  agents: Array.from({ length: agents }, (_, index) => agent(`${ticket.key}-${index}`, runState)),
});
const empty: BoardModel["lanes"] = {
  todo: [],
  planned: [],
  building: [],
  reviewing: [],
  verifying: [],
  pr: [],
  awaiting_approval: [],
  merged: [],
  off_path: [],
};

const model: BoardModel = {
  lanes: {
    ...empty,
    planned: [view({ key: "T-3", title: "c", stage: "planned", dependsOn: ["T-1"] })],
    building: [
      view({ key: "T-1", title: "a", stage: "building" }, 2, "working"),
      view(
        { key: "T-2", title: "b", stage: "building", dependsOn: ["T-1", "T-404"] },
        1,
        "waiting",
      ),
      view({ key: "T-4", title: "d", stage: "building" }, 1),
    ],
    merged: [view({ key: "T-5", title: "e", stage: "merged" })],
    off_path: [view({ key: "T-6", title: "f", stage: "off_path" })],
  },
  unassigned: [],
};

describe("placing a ticket by its stage and its agents", () => {
  const now = Date.parse("2026-11-20T10:10:00.000Z");
  const recent = "2026-11-20T10:09:00.000Z";
  const working = agent("w", "working");
  const stopped = agent("s", "idle");
  const childRecent = { ...agent("c", "idle"), waitingOnChildren: true, updatedAt: recent };
  const childStale = { ...agent("c", "idle"), waitingOnChildren: true };
  it.each([
    { stage: "merged", agents: [stopped], lane: "done", word: "Stopped" },
    { stage: "off_path", agents: [working], lane: "done", word: "Working" },
    { stage: "building", agents: [stopped], lane: "waiting", word: "Stopped" },
    { stage: "awaiting_approval", agents: [], lane: "waiting", word: null },
    { stage: "reviewing", agents: [working], lane: "running", word: "Working" },
    { stage: "building", agents: [childRecent], lane: "running", word: "Working" },
    { stage: "building", agents: [childStale], lane: "waiting", word: "Idle" },
    { stage: "verifying", agents: [stopped, childStale], lane: "waiting", word: "Idle" },
    { stage: "planned", agents: [working], lane: "running", word: "Working" },
    { stage: "todo", agents: [], lane: "todo", word: null },
  ] as const)(
    "Given a $stage ticket whose agents read $word, then it sits in $lane",
    ({ stage, agents, lane, word }) => {
      expect([
        ticketLane(stage, isWorking(agents, now)),
        ticketStatus(agents, now)?.word ?? null,
      ]).toEqual([lane, word]);
    },
  );
});

describe("laying out the lanes", () => {
  const defaults = hiddenFilters(new Set(), []);
  const layout = layoutBoard(model, {}, 0, defaults);
  const lane = (id: string, from = layout) => from.lanes.find((entry) => entry.id === id);
  const keys = (id: string, from = layout) => lane(id, from)?.frames.map((frame) => frame.key);

  it("Given tickets in four stages, when laid out with the default tags, then four lanes show, live tickets run, an idle one waits, and the Done lane is hidden", () => {
    expect(layout.lanes.map((entry) => entry.id)).toEqual([
      "for_you",
      "todo",
      "running",
      "waiting",
    ]);
    expect([keys("todo"), keys("running"), keys("waiting")]).toEqual([
      ["T-3"],
      ["T-1", "T-2"],
      ["T-4"],
    ]);
    const running = lane("running");
    expect(running?.x).toBe(40 + 2 * (LANE_WIDTH + LANE_GAP));
    expect(running?.frames.map((frame) => [frame.x, frame.y])).toEqual([
      [running!.x + LANE_PAD, LANES_TOP + LANE_HEAD],
      [running!.x + LANE_PAD, LANES_TOP + LANE_HEAD + CARD_HEIGHT + FRAME_GAP],
    ]);
    expect(running?.frames[0]?.width).toBe(FRAME_WIDTH);
  });

  it.each([
    { flipped: [], hidden: ["done"] },
    {
      flipped: ["for_you", "done", "stage:building", "add:wait"],
      hidden: ["for_you", "stage:building", "add:wait"],
    },
  ])(
    "Given the flips $flipped, when the filters resolve, then $hidden hide",
    ({ flipped, hidden }) => {
      const wait: Addition = { id: "wait", title: "w", asOf: "", place: "canvas", blocks: [] };
      expect([...hiddenFilters(new Set(flipped), [wait])]).toEqual(hidden);
    },
  );

  it("Given the Done lane shown and two agents moved to Done, when laid out, then the agents frame leads it, merged and off-path tickets follow, and the header counts all four, as the Done tag does", () => {
    const shown = layoutBoard(model, {}, 0, hiddenFilters(new Set(["done"]), []), [], 0, 2);
    expect(keys("done", shown)).toEqual([DONE_AGENTS_KEY, "T-5", "T-6"]);
    const views = new Map(
      [...model.lanes.merged, ...model.lanes.off_path].map((v) => [v.ticket.key, v]),
    );
    expect(laneCount(lane("done", shown)!, views, 0, 2)).toBe(4);
  });

  it("Given a hidden tag, when laid out, then its cards leave the lane and the lane stays", () => {
    const hidden = layoutBoard(model, {}, 0, new Set(["stage:planned", "stage:building"]));
    expect([keys("todo", hidden), keys("running", hidden), keys("done", hidden)]).toEqual([
      [],
      [],
      ["T-5", "T-6"],
    ]);
  });

  it("Given the For you lane hidden, when laid out, then the lanes after it pack left", () => {
    const hidden = layoutBoard(model, {}, 0, new Set(["for_you", ...defaults]));
    expect(hidden.lanes.map((entry) => [entry.id, entry.x])).toEqual([
      ["todo", 40],
      ["running", 40 + LANE_WIDTH + LANE_GAP],
      ["waiting", 40 + 2 * (LANE_WIDTH + LANE_GAP)],
    ]);
  });

  it("Given agents no ticket claims, when laid out, then their frame leads the To do lane", () => {
    const withOrphan = layoutBoard({ ...model, unassigned: [agent("orphan")] }, {}, 0, defaults);
    expect(keys("todo", withOrphan)).toEqual([UNASSIGNED_KEY, "T-3"]);
  });

  it.each([
    { name: "over a lane", at: { x: 367.5, y: 431.5 }, to: { x: 367.5, y: 590 } },
    { name: "clear of the lanes", at: { x: 1600, y: 40 }, to: { x: 1600, y: 40 } },
  ])("Given a free card $name, then it sits at $to", ({ at, to }) => {
    expect(besideLanes(at, { width: 320, height: 380 }, layout)).toEqual(to);
  });

  it("Given more To do cards than a lane holds, when laid out, then the lane is capped, its cards run on to scroll, and free cards and the content sit below the cap", () => {
    const many = Array.from({ length: 20 }, (_, at) =>
      view({ key: `T-${at + 10}`, title: "x", stage: "todo" }),
    );
    const tall = layoutBoard({ ...model, lanes: { ...empty, todo: many } }, {}, 0, defaults);
    const todo = lane("todo", tall)!;
    expect(todo.height).toBe(LANE_MAX_HEIGHT);
    expect(todo.frames.at(-1)!.y).toBe(todo.y + LANE_HEAD + 19 * (CARD_HEIGHT + FRAME_GAP));
    expect(tall.content.height).toBe(todo.y + LANE_MAX_HEIGHT + 40);
    expect(besideLanes({ x: 100, y: todo.y }, { width: 320, height: 380 }, tall)).toEqual({
      x: 100,
      y: todo.y + LANE_MAX_HEIGHT + 40,
    });
  });

  it("Given a saved order, when laid out, then it wins and new tickets follow", () => {
    expect(orderedKeys(["T-1", "T-2", "T-4"], ["T-2", "T-9", "T-1"])).toEqual([
      "T-2",
      "T-1",
      "T-4",
    ]);
    expect(keys("running", layoutBoard(model, { running: ["T-2", "T-1"] }, 0, defaults))).toEqual([
      "T-2",
      "T-1",
    ]);
  });
});

describe("laying out additions", () => {
  const base = { title: "t", asOf: "2026-11-23T09:40:00Z" };
  const blocks = [{ type: "text" as const, text: "x" }];
  const line = (id: string): Addition => ({ ...base, id, place: "orchestrator", blocks });
  const ci: Addition = { ...base, id: "ci", place: "lane", lane: "building", blocks };
  const wait: Addition = { ...base, id: "wait", place: "canvas", blocks };
  const building = (layout: ReturnType<typeof layoutBoard>) =>
    layout.lanes.find((entry) => entry.id === "running");

  it("Given two orchestrator lines, when laid out, then the lanes start 36px lower", () => {
    const moved = building(layoutBoard(model, {}, 0, new Set(), [line("a"), line("b")]));
    expect([moved?.y, moved?.frames[0]?.y]).toEqual([426, 460]);
  });

  it("Given one orchestrator line and two problem lines, when laid out, then the lanes start 54px lower", () => {
    const moved = building(layoutBoard(model, {}, 0, new Set(), [line("a")], 2));
    expect([moved?.y, moved?.frames[0]?.y]).toEqual([444, 478]);
  });

  it("Given a lane card for the building stage, when laid out, then it leads the Waiting lane, because no agent runs it", () => {
    const laid = layoutBoard(model, {}, 0, new Set(["stage:merged", "stage:off_path"]), [ci]);
    const frames = (id: string) =>
      laid.lanes.find((entry) => entry.id === id)?.frames.map((frame) => [frame.key, frame.y]);
    expect([frames("running"), frames("waiting")]).toEqual([
      [
        ["T-1", 424],
        ["T-2", 484],
      ],
      [
        ["__add:ci", 424],
        ["T-4", 572],
      ],
    ]);
  });

  it("Given a canvas addition, when laid out, then it is a lane after the stage lanes and widens the canvas", () => {
    const layout = layoutBoard(model, {}, 0, new Set(), [wait]);
    expect([layout.additionLanes, layout.content.width]).toEqual([
      [{ key: "wait", x: 1560, y: 390, width: 288, height: 314 }],
      1888,
    ]);
  });

  it("Given a hidden canvas addition lane, when laid out, then it is left out", () => {
    const layout = layoutBoard(model, {}, 0, new Set(["add:wait"]), [wait]);
    expect([layout.additionLanes, layout.content.width]).toEqual([[], 1584]);
  });
});

describe("dragging a frame", () => {
  const building = layoutBoard(
    model,
    {},
    0,
    new Set(["stage:merged", "stage:off_path"]),
  ).lanes.find((entry) => entry.id === "running")!;
  const [first] = building.frames;
  if (first === undefined) throw new Error("the building lane has no frame");

  it("Given a frame dragged past its neighbor's center, when dropped, then it takes the neighbor's place", () => {
    expect(reorderByDrag(building, "T-1", first.height + FRAME_GAP + 1)).toEqual(["T-2", "T-1"]);
    expect(reorderByDrag(building, "T-2", -first.height - FRAME_GAP - 1)).toEqual(["T-2", "T-1"]);
  });

  it("Given a short drag, when dropped, then the order stays", () => {
    expect(reorderByDrag(building, "T-1", 10)).toEqual(["T-1", "T-2"]);
  });

  it("Given a drag past the lane, when clamped, then the frame stays inside it", () => {
    expect(clampDrag(building, first, -500)).toBe(0);
    const last = building.frames.at(-1)!;
    expect(clampDrag(building, first, 5000)).toBe(last.y - first.y);
  });
});
