import { describe, expect, it } from "vite-plus/test";

import type { Addition } from "../domain/additions";
import type { Ticket } from "../domain/ticket";
import type { AgentView, BoardModel, TicketView } from "../state/boardModel";
import {
  clampDrag,
  FRAME_WIDTH,
  CARD_HEIGHT,
  FRAME_GAP,
  LANE_GAP,
  LANE_HEAD,
  LANE_PAD,
  LANE_WIDTH,
  LANES_TOP,
  hiddenFilters,
  layoutBoard,
  orderedKeys,
  reorderByDrag,
  UNASSIGNED_KEY,
} from "./layout";

const agent = (threadId: string): AgentView => ({
  threadId,
  title: threadId,
  role: "task",
  registered: true,
  outsideRegistry: false,
  ticketKey: null,
  driver: null,
  runState: "idle",
  pendingRequest: false,
  branch: null,
  parentThreadId: null,
  round: null,
  updatedAt: "2026-11-20T10:00:00.000Z",
});

const view = (ticket: Ticket, agents = 0): TicketView => ({
  ticket,
  agents: Array.from({ length: agents }, (_, index) => agent(`${ticket.key}-${index}`)),
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
      view({ key: "T-1", title: "a", stage: "building" }, 2),
      view({ key: "T-2", title: "b", stage: "building", dependsOn: ["T-1", "T-404"] }),
    ],
    merged: [view({ key: "T-5", title: "e", stage: "merged" })],
    off_path: [view({ key: "T-6", title: "f", stage: "off_path" })],
  },
  unassigned: [],
};

describe("laying out the lanes", () => {
  const defaults = hiddenFilters(new Set(), []);
  const layout = layoutBoard(model, {}, 0, defaults);
  const lane = (id: string, from = layout) => from.lanes.find((entry) => entry.id === id);
  const keys = (id: string, from = layout) => lane(id, from)?.frames.map((frame) => frame.key);

  it("Given tickets in four stages, when laid out with the default tags, then three lanes show and merged and off-path cards are hidden", () => {
    expect(layout.lanes.map((entry) => entry.id)).toEqual(["for_you", "todo", "running"]);
    expect([keys("todo"), keys("running")]).toEqual([["T-3"], ["T-1", "T-2"]]);
    const running = lane("running");
    expect(running?.x).toBe(40 + 2 * (LANE_WIDTH + LANE_GAP));
    expect(running?.frames.map((frame) => [frame.x, frame.y])).toEqual([
      [running!.x + LANE_PAD, LANES_TOP + LANE_HEAD],
      [running!.x + LANE_PAD, LANES_TOP + LANE_HEAD + CARD_HEIGHT + FRAME_GAP],
    ]);
    expect(running?.frames[0]?.width).toBe(FRAME_WIDTH);
  });

  it.each([
    { flipped: [], hidden: ["stage:merged", "stage:off_path"] },
    {
      flipped: ["for_you", "stage:building", "stage:merged", "add:wait"],
      hidden: ["for_you", "stage:building", "stage:off_path", "add:wait"],
    },
  ])(
    "Given the flips $flipped, when the filters resolve, then $hidden hide",
    ({ flipped, hidden }) => {
      const wait: Addition = { id: "wait", title: "w", asOf: "", place: "canvas", blocks: [] };
      expect([...hiddenFilters(new Set(flipped), [wait])]).toEqual(hidden);
    },
  );

  it("Given merged shown and a saved order that puts it first, when laid out, then the merged card still follows the active ones", () => {
    const shown = hiddenFilters(new Set(["stage:merged"]), []);
    const moved = layoutBoard(model, { running: ["T-5", "T-2", "T-1"] }, 0, shown);
    expect(keys("running", moved)).toEqual(["T-2", "T-1", "T-5"]);
  });

  it("Given a hidden tag, when laid out, then its cards leave the lane and the lane stays", () => {
    const hidden = layoutBoard(model, {}, 0, new Set(["stage:planned", "stage:building"]));
    expect([keys("todo", hidden), keys("running", hidden)]).toEqual([[], ["T-5", "T-6"]]);
  });

  it("Given the For you lane hidden, when laid out, then the lanes after it pack left", () => {
    const hidden = layoutBoard(model, {}, 0, new Set(["for_you", ...defaults]));
    expect(hidden.lanes.map((entry) => [entry.id, entry.x])).toEqual([
      ["todo", 40],
      ["running", 40 + LANE_WIDTH + LANE_GAP],
    ]);
  });

  it("Given agents no ticket claims, when laid out, then their frame leads the To do lane", () => {
    const withOrphan = layoutBoard({ ...model, unassigned: [agent("orphan")] }, {}, 0, defaults);
    expect(keys("todo", withOrphan)).toEqual([UNASSIGNED_KEY, "T-3"]);
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
    expect([moved?.y, moved?.frames[0]?.y]).toEqual([396, 430]);
  });

  it("Given one orchestrator line and two problem lines, when laid out, then the lanes start 54px lower", () => {
    const moved = building(layoutBoard(model, {}, 0, new Set(), [line("a")], 2));
    expect([moved?.y, moved?.frames[0]?.y]).toEqual([414, 448]);
  });

  it("Given a lane card for the building stage, when laid out, then it is the Running lane's first frame and the tickets follow it", () => {
    const lane = building(
      layoutBoard(model, {}, 0, new Set(["stage:merged", "stage:off_path"]), [ci]),
    );
    expect(lane?.frames.map((frame) => [frame.key, frame.y, frame.height])).toEqual([
      ["__add:ci", 394, 140],
      ["T-1", 542, 52],
      ["T-2", 602, 52],
    ]);
  });

  it("Given a canvas addition, when laid out, then it is a lane after the stage lanes and widens the canvas", () => {
    const layout = layoutBoard(model, {}, 0, new Set(), [wait]);
    expect([layout.additionLanes, layout.content.width]).toEqual([
      [{ key: "wait", x: 952, y: 360, width: 288, height: 314 }],
      1280,
    ]);
  });

  it("Given a hidden canvas addition lane, when laid out, then it is left out", () => {
    const layout = layoutBoard(model, {}, 0, new Set(["add:wait"]), [wait]);
    expect([layout.additionLanes, layout.content.width]).toEqual([[], 976]);
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
    expect(clampDrag(building, first, 5000)).toBe(
      building.y + building.height - LANE_PAD - first.height - first.y,
    );
  });
});
