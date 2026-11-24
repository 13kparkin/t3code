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
  },
  unassigned: [],
};

describe("laying out the lanes", () => {
  const layout = layoutBoard(model, {});
  const lane = (id: string) => layout.lanes.find((entry) => entry.id === id);

  it("Given tickets in two stages, when laid out, then each frame sits in its stage's column and frames stack in file order", () => {
    expect(layout.lanes.map((entry) => entry.id)).toEqual([
      "for_you",
      "todo",
      "planned",
      "building",
      "reviewing",
      "verifying",
      "pr",
      "awaiting_approval",
      "merged",
    ]);
    const building = lane("building");
    expect(building?.x).toBe(40 + 3 * (LANE_WIDTH + LANE_GAP));
    expect(building?.frames.map((frame) => [frame.key, frame.x, frame.y])).toEqual([
      ["T-1", building!.x + LANE_PAD, LANES_TOP + LANE_HEAD],
      ["T-2", building!.x + LANE_PAD, LANES_TOP + LANE_HEAD + CARD_HEIGHT + FRAME_GAP],
    ]);
    expect(building?.frames[0]?.width).toBe(FRAME_WIDTH);
  });

  it("Given a hidden lane, when laid out, then it is left out and the lanes after it pack left", () => {
    const hidden = layoutBoard(model, {}, 0, new Set(["todo", "planned"]));
    expect(hidden.lanes.map((entry) => entry.id)).not.toContain("planned");
    expect(hidden.lanes.find((entry) => entry.id === "building")?.x).toBe(
      40 + 1 * (LANE_WIDTH + LANE_GAP),
    );
  });

  it("Given agents no ticket claims, when laid out, then an unassigned lane follows the others", () => {
    const withOrphan = layoutBoard({ ...model, unassigned: [agent("orphan")] }, {});
    const last = withOrphan.lanes.at(-1);
    expect(last?.id).toBe("unassigned");
    expect(last?.frames.map((frame) => frame.key)).toEqual([UNASSIGNED_KEY]);
  });

  it("Given a saved order, when laid out, then it wins and new tickets follow", () => {
    expect(orderedKeys(["T-1", "T-2", "T-4"], ["T-2", "T-9", "T-1"])).toEqual([
      "T-2",
      "T-1",
      "T-4",
    ]);
    const moved = layoutBoard(model, { building: ["T-2", "T-1"] });
    expect(moved.lanes.find((entry) => entry.id === "building")?.frames.map((f) => f.key)).toEqual([
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
    layout.lanes.find((entry) => entry.id === "building");

  it("Given two orchestrator lines, when laid out, then the lanes start 36px lower", () => {
    const moved = building(layoutBoard(model, {}, 0, new Set(), [line("a"), line("b")]));
    expect([moved?.y, moved?.frames[0]?.y]).toEqual([396, 430]);
  });

  it("Given one orchestrator line and two problem lines, when laid out, then the lanes start 54px lower", () => {
    const moved = building(layoutBoard(model, {}, 0, new Set(), [line("a")], 2));
    expect([moved?.y, moved?.frames[0]?.y]).toEqual([414, 448]);
  });

  it("Given a lane card, when laid out, then it is the lane's first frame and the tickets follow it", () => {
    const lane = building(layoutBoard(model, {}, 0, new Set(), [ci]));
    expect(lane?.frames.map((frame) => [frame.key, frame.y, frame.height])).toEqual([
      ["__add:ci", 394, 140],
      ["T-1", 542, 52],
      ["T-2", 602, 52],
    ]);
  });

  it("Given a canvas addition, when laid out, then it is a lane after the stage lanes and widens the canvas", () => {
    const layout = layoutBoard(model, {}, 0, new Set(), [wait]);
    expect([layout.additionLanes, layout.content.width]).toEqual([
      [{ key: "wait", x: 2776, y: 360, width: 288, height: 314 }],
      3104,
    ]);
  });

  it("Given a hidden canvas addition lane, when laid out, then it is left out", () => {
    const layout = layoutBoard(model, {}, 0, new Set(["add:wait"]), [wait]);
    expect([layout.additionLanes, layout.content.width]).toEqual([[], 2800]);
  });
});

describe("dragging a frame", () => {
  const building = layoutBoard(model, {}).lanes.find((entry) => entry.id === "building")!;
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
