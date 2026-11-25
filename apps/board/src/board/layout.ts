import type { Addition } from "../domain/additions";
import type { CardView } from "../domain/forYou";
import { TICKET_STAGES, type TicketStage } from "../domain/ticket";
import type { BoardModel } from "../state/boardModel";
import type { FrameOrder } from "../state/boardUi";
import { activeAgentOf } from "./activeAgent";
import type { Rect } from "./viewport";

type StageLane = "todo" | "running" | "waiting" | "done";
export type LaneId = "for_you" | StageLane;
const LANE_IDS: ReadonlyArray<LaneId> = ["for_you", "todo", "running", "waiting", "done"];

export const LANE_LABEL = {
  for_you: "For you",
  todo: "To do",
  running: "Running",
  waiting: "Waiting",
  done: "Done",
} as const satisfies Record<LaneId, string>;

/** Each stage's tag colour, and the lane an `additions.json` lane card for that stage sits in. */
export const STAGE_TAGS = {
  todo: { lane: "todo", tone: "text-zinc-300" },
  planned: { lane: "todo", tone: "text-zinc-400" },
  building: { lane: "running", tone: "text-blue-300" },
  reviewing: { lane: "running", tone: "text-violet-300" },
  verifying: { lane: "running", tone: "text-cyan-300" },
  pr: { lane: "running", tone: "text-indigo-300" },
  awaiting_approval: { lane: "running", tone: "text-orange-300" },
  merged: { lane: "done", tone: "text-emerald-300" },
  off_path: { lane: "done", tone: "text-red-300" },
} as const satisfies Record<TicketStage, { readonly lane: StageLane; readonly tone: string }>;

/** A ticket sits in Running only while one of its agents is live, and an open ticket with none waits. */
export function ticketLane(stage: TicketStage, live: boolean): StageLane {
  if (stage === "merged" || stage === "off_path") return "done";
  if (live) return "running";
  return stage === "todo" || stage === "planned" ? "todo" : "waiting";
}

/** The filter id of the Done lane, which starts hidden. */
export const DONE_TAG = "done";
export const stageTagId = (stage: TicketStage) => `stage:${stage}`;
export const additionLaneId = (id: string) => `add:${id}`;

/**
 * The filter ids that hide their cards or lane: the For you and Done lanes, each stage's tag, and
 * each `canvas` addition's lane. The saved set holds the ids the user flipped from their default.
 */
export function hiddenFilters(
  flipped: ReadonlySet<string>,
  additions: ReadonlyArray<Addition>,
): ReadonlySet<string> {
  const filters = [
    { id: "for_you", starts: false },
    { id: DONE_TAG, starts: true },
    ...TICKET_STAGES.map((stage) => ({ id: stageTagId(stage), starts: false })),
    ...additions.flatMap((item) =>
      item.place === "canvas" ? [{ id: additionLaneId(item.id), starts: false }] : [],
    ),
  ];
  return new Set(
    filters.filter(({ id, starts }) => starts !== flipped.has(id)).map(({ id }) => id),
  );
}

/** The key of the one frame that holds the agents no ticket claims. */
export const UNASSIGNED_KEY = "__unassigned";
/** The key of the Done lane's frame of agent cards the user moved to Done. */
export const DONE_AGENTS_KEY = "__done_agents";
/** A lane card's frame key is this and the addition's id. */
export const ADDITION_KEY = "__add:";
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
export const ORCHESTRATOR_BOX: Rect = { x: LEFT, y: LEFT, width: 340, height: 310 };
/** Where the lanes start, below the orchestrator card. */
export const LANES_TOP = ORCHESTRATOR_BOX.y + ORCHESTRATOR_BOX.height + LEFT;

export interface FrameBox extends Rect {
  readonly key: string;
}

export interface LaneBox extends Rect {
  readonly id: LaneId;
  readonly frames: ReadonlyArray<FrameBox>;
}

export interface Layout {
  readonly lanes: ReadonlyArray<LaneBox>;
  /** `canvas` additions, each a lane of its own after the stage lanes, keyed by the addition's id. */
  readonly additionLanes: ReadonlyArray<FrameBox>;
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

/** Later lanes pack left over a hidden one. */
export function layoutBoard(
  model: BoardModel,
  order: FrameOrder,
  forYouRows = 0,
  hidden: ReadonlySet<string> = NO_HIDDEN,
  additions: ReadonlyArray<Addition> = [],
  problemLines = 0,
  doneAgents = 0,
): Layout {
  const lines = additions.filter((item) => item.place === "orchestrator").length + problemLines;
  const top = LANES_TOP + lines * ADDITION_LINE;
  const lanes: LaneBox[] = [];
  LANE_IDS.forEach((id) => {
    if (hidden.has(id === "done" ? DONE_TAG : id)) return;
    const x = LEFT + lanes.length * (LANE_WIDTH + LANE_GAP);
    const items: Array<{ key: string; height: number }> = [];
    if (id !== "for_you") {
      for (const card of additions) {
        if (card.place === "lane" && STAGE_TAGS[card.lane].lane === id) {
          items.push({ key: ADDITION_KEY + card.id, height: ADDITION_FRAME });
        }
      }
      if (id === "todo" && model.unassigned.length > 0) {
        items.push({ key: UNASSIGNED_KEY, height: unassignedHeight(model.unassigned.length) });
      }
      if (id === "done" && doneAgents > 0) {
        items.push({ key: DONE_AGENTS_KEY, height: unassignedHeight(doneAgents) });
      }
      const keys = TICKET_STAGES.filter((stage) => !hidden.has(stageTagId(stage))).flatMap(
        (stage) =>
          model.lanes[stage]
            .filter((view) => ticketLane(stage, activeAgentOf(view.agents) !== undefined) === id)
            .map((view) => view.ticket.key),
      );
      for (const key of orderedKeys(keys, order[id])) items.push({ key, height: CARD_HEIGHT });
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
