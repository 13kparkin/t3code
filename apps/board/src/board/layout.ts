import type { Addition } from "../domain/additions";
import type { CardView } from "../domain/forYou";
import { STAGE_LABEL, TICKET_STAGES, type TicketStage } from "../domain/ticket";
import type { BoardModel } from "../state/boardModel";
import type { FrameOrder } from "../state/boardUi";
import type { Rect } from "./viewport";

export type LaneId = "for_you" | Exclude<TicketStage, "off_path"> | "unassigned";
/** Off-path tickets have no lane. The orchestrator card lists them. */
export const LANE_IDS: ReadonlyArray<LaneId> = [
  "for_you",
  ...TICKET_STAGES.filter((stage) => stage !== "off_path"),
  "unassigned",
];

export const LANE_LABEL = {
  for_you: "For you",
  ...STAGE_LABEL,
  unassigned: "Unassigned",
} as const satisfies Record<LaneId, string>;

/** The key of the one frame that holds the agents no ticket claims. */
export const UNASSIGNED_KEY = "__unassigned";
/** A lane card's frame key is this and the addition's id. */
export const ADDITION_KEY = "__add:";
/** The hide key of a `canvas` addition's own lane, which folds like a stage lane. */
export const additionLaneId = (id: string) => `add:${id}`;
/** Each orchestrator line and problem line is one 18px row on the orchestrator card, so the lanes start that much lower. */
export const ADDITION_LINE = 18;
const ADDITION_FRAME = 140;
const ADDITION_LANE = 280;

export const LANE_WIDTH = 288;
export const LANE_GAP = 16;
export const LANE_HEAD = 34;
export const LANE_PAD = 12;
export const LANE_MIN_HEIGHT = 160;
export const FRAME_WIDTH = LANE_WIDTH - LANE_PAD * 2;
export const FRAME_GAP = 8;
/** Every ticket card, and every unassigned agent row, is two lines this tall. */
export const CARD_HEIGHT = 52;
export const UNASSIGNED_HEAD = 30;
export const FRAME_PAD = 6;
export const CARD_GAP = 6;
export const ARTIFACT_HEIGHT = 36;
export const ARTIFACT_GAP = 4;
const FOR_YOU_NOTE = 20;
const MERGE_CARD = 660;
const QUESTION_CARD = 260;
const ENGINE_CARD = 240;
const PLAIN_CARD = 150;
const TRACKER_CARD = 250;
const RESOLVED_CARD = 34;
const LEFT = 40;
/** The orchestrator card's place on the canvas. */
export const ORCHESTRATOR_BOX: Rect = { x: LEFT, y: LEFT, width: 340, height: 280 };
/** Where the lanes start, below the orchestrator card. */
export const LANES_TOP = ORCHESTRATOR_BOX.y + ORCHESTRATOR_BOX.height + LEFT;
const EDGE_ATTACH_Y = CARD_HEIGHT / 2;
const EDGE_CURVE = 40;

export interface FrameBox extends Rect {
  readonly key: string;
}

export interface LaneBox extends Rect {
  readonly id: LaneId;
  readonly frames: ReadonlyArray<FrameBox>;
}

export interface Edge {
  /** The ticket that is depended on. */
  readonly from: string;
  readonly to: string;
}

export interface Layout {
  readonly lanes: ReadonlyArray<LaneBox>;
  /** `canvas` additions, each a lane of its own after the stage lanes, keyed by the addition's id. */
  readonly additionLanes: ReadonlyArray<FrameBox>;
  readonly edges: ReadonlyArray<Edge>;
  readonly content: Rect;
}

/** The frame of agents no ticket claims: a note, then one row per agent. */
export const unassignedHeight = (agents: number): number =>
  UNASSIGNED_HEAD + FRAME_PAD + agents * CARD_HEIGHT + (agents - 1) * CARD_GAP;

/** Frames in the order the user dragged them to, and any the saved order lacks after them, in file order. */
export function orderedKeys(keys: ReadonlyArray<string>, saved: ReadonlyArray<string> = []) {
  const present = new Set(keys);
  const kept = saved.filter((key) => present.has(key));
  const placed = new Set(kept);
  return [...kept, ...keys.filter((key) => !placed.has(key))];
}

/**
 * The For-you lane's height under its header. Card heights follow their text, so these are
 * estimates that keep fit-to-content and the lane's rule roughly right.
 */
export function forYouHeight(views: ReadonlyArray<CardView>): number {
  const height = (view: CardView): number => {
    if (view.state === "resolved") return RESOLVED_CARD;
    if (view.card.origin === "engine") return ENGINE_CARD;
    if (view.card.item.kind === "merge_approval") return MERGE_CARD;
    if (view.card.item.kind === "tracker_write") return TRACKER_CARD;
    return view.card.item.kind === "question" ? QUESTION_CARD : PLAIN_CARD;
  };
  return views.reduce((sum, view) => sum + height(view) + CARD_GAP, FOR_YOU_NOTE);
}

const NO_HIDDEN: ReadonlySet<string> = new Set();

/** Stacks each shown lane's frames in its column, and adds one edge for each `dependsOn` between two tickets. Later lanes pack left over hidden ones. */
export function layoutBoard(
  model: BoardModel,
  order: FrameOrder,
  forYouRows = 0,
  hidden: ReadonlySet<string> = NO_HIDDEN,
  additions: ReadonlyArray<Addition> = [],
  problemLines = 0,
): Layout {
  const lines = additions.filter((item) => item.place === "orchestrator").length + problemLines;
  const top = LANES_TOP + lines * ADDITION_LINE;
  const lanes: LaneBox[] = [];
  const edges: Edge[] = [];
  const known = new Set(
    Object.values(model.lanes).flatMap((lane) => lane.map((v) => v.ticket.key)),
  );
  LANE_IDS.forEach((id) => {
    if (hidden.has(id)) return;
    const x = LEFT + lanes.length * (LANE_WIDTH + LANE_GAP);
    const items: Array<{ key: string; height: number }> = [];
    if (id === "unassigned") {
      if (model.unassigned.length === 0) return;
      items.push({ key: UNASSIGNED_KEY, height: unassignedHeight(model.unassigned.length) });
    } else if (id !== "for_you") {
      const card = additions.find((item) => item.place === "lane" && item.lane === id);
      if (card !== undefined) items.push({ key: ADDITION_KEY + card.id, height: ADDITION_FRAME });
      const views = model.lanes[id];
      for (const key of orderedKeys(
        views.map((view) => view.ticket.key),
        order[id],
      )) {
        const view = views.find((entry) => entry.ticket.key === key);
        if (view === undefined) continue;
        items.push({ key, height: CARD_HEIGHT });
        for (const dependency of view.ticket.dependsOn ?? []) {
          if (known.has(dependency)) edges.push({ from: dependency, to: key });
        }
      }
    }
    let y = top + LANE_HEAD;
    const frames = items.map(({ key, height }): FrameBox => {
      const box = { key, x: x + LANE_PAD, y, width: FRAME_WIDTH, height };
      y += height + FRAME_GAP;
      return box;
    });
    const empty = id === "for_you" ? LANE_HEAD + forYouRows + LANE_PAD : LANE_MIN_HEIGHT;
    const bottom = frames.length === 0 ? top + empty : y - FRAME_GAP + LANE_PAD;
    lanes.push({
      id,
      x,
      y: top,
      width: LANE_WIDTH,
      height: Math.max(LANE_MIN_HEIGHT, bottom - top),
      frames,
    });
  });
  const additionLanes = additions
    .filter((item) => item.place === "canvas" && !hidden.has(additionLaneId(item.id)))
    .map((item, at) => ({
      key: item.id,
      x: LEFT + (lanes.length + at) * (LANE_WIDTH + LANE_GAP),
      y: top,
      width: LANE_WIDTH,
      height: LANE_HEAD + ADDITION_LANE,
    }));
  const columns = lanes.length + additionLanes.length;
  const right = LEFT + columns * (LANE_WIDTH + LANE_GAP) - LANE_GAP;
  const bottom = Math.max(...[...lanes, ...additionLanes].map((lane) => lane.y + lane.height));
  return {
    lanes,
    additionLanes,
    edges,
    content: { x: 0, y: 0, width: right + LEFT, height: bottom + LEFT },
  };
}

/** The lane's frame keys after `key` is dragged `dy` px, which place it by its center among the others. */
export function reorderByDrag(lane: LaneBox, key: string, dy: number): ReadonlyArray<string> {
  const moved = lane.frames.find((frame) => frame.key === key);
  if (moved === undefined) return lane.frames.map((frame) => frame.key);
  const center = moved.y + moved.height / 2 + dy;
  const others = lane.frames.filter((frame) => frame.key !== key);
  const before = others.filter((frame) => frame.y + frame.height / 2 < center).length;
  return [...others.slice(0, before), moved, ...others.slice(before)].map((frame) => frame.key);
}

/** How far a frame may be dragged and stay inside its lane. */
export function clampDrag(lane: LaneBox, frame: FrameBox, dy: number): number {
  const min = lane.y + LANE_HEAD - frame.y;
  const max = lane.y + lane.height - LANE_PAD - frame.height - frame.y;
  return Math.min(Math.max(dy, min), Math.max(min, max));
}

/** A curve from the frame that is depended on to the frame that depends on it, ending at the dependent's edge. */
export function edgePath(from: FrameBox, to: FrameBox): string {
  const y1 = from.y + EDGE_ATTACH_Y;
  const y2 = to.y + EDGE_ATTACH_Y;
  if (from.x === to.x) {
    const x = from.x;
    return `M ${x} ${y1} C ${x - EDGE_CURVE} ${y1}, ${x - EDGE_CURVE} ${y2}, ${x} ${y2}`;
  }
  const forward = to.x > from.x;
  const x1 = forward ? from.x + from.width : from.x;
  const x2 = forward ? to.x : to.x + to.width;
  const bend = Math.max(EDGE_CURVE, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}
