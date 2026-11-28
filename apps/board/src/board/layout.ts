import type { Addition } from "../domain/additions";
import type { CardView } from "../domain/forYou";
import { TICKET_STAGES, type TicketStage } from "../domain/ticket";
import type { BoardModel } from "../state/boardModel";
import { isWorking } from "./ticketStatus";
import type { Rect } from "./viewport";

/** The saved order of each lane's frames, by lane id. */
export type FrameOrder = Readonly<Record<string, ReadonlyArray<string>>>;

export type StageLane = "todo" | "running" | "waiting" | "done";
export type LaneId = "for_you" | StageLane;
const LANE_IDS: ReadonlyArray<LaneId> = ["for_you", "todo", "running", "waiting", "done"];

export const LANE_LABEL = {
  for_you: "For you",
  todo: "To do",
  running: "Running",
  waiting: "Waiting",
  done: "Done",
} as const satisfies Record<LaneId, string>;

/** A ticket sits in Running only while one of its agents is live, and an open ticket with none waits. */
export function ticketLane(stage: TicketStage, live: boolean): StageLane {
  if (stage === "merged" || stage === "off_path") return "done";
  if (live) return "running";
  return stage === "todo" || stage === "planned" ? "todo" : "waiting";
}

/** A stage tag's count. The To do tag also counts the agent rows in the To do lane, as its header does. */
export const stageTagCount = (
  stage: TicketStage,
  stages: Readonly<Record<TicketStage, number>>,
  todoAgents: number,
) => stages[stage] + (stage === "todo" ? todoAgents : 0);

/** The filter id of the Done lane, which starts hidden. */
export const DONE_TAG = "done";
export const stageTagId = (stage: TicketStage) => `stage:${stage}`;
export const additionLaneId = (id: string) => `add:${id}`;

/** The board's sections beside the orchestrator card, which its buttons show and hide. */
export const BOARD_SECTIONS = [
  { id: "artifacts", label: "Artifacts", startsHidden: false },
  { id: "archived", label: "Archived", startsHidden: true },
  { id: "review", label: "Review", startsHidden: true },
] as const;
export type BoardSectionId = (typeof BOARD_SECTIONS)[number]["id"];
export const sectionFilterId = (id: BoardSectionId) => `section:${id}`;

/**
 * The filter ids that hide their cards, lane or section: the For you and Done lanes, each stage's
 * tag, and each board section. The saved set holds the ids the user flipped from their default.
 */
export function hiddenFilters(flipped: ReadonlySet<string>): ReadonlySet<string> {
  const filters = [
    { id: "for_you", starts: false },
    { id: DONE_TAG, starts: true },
    ...TICKET_STAGES.map((stage) => ({ id: stageTagId(stage), starts: false })),
    ...BOARD_SECTIONS.map((section) => ({
      id: sectionFilterId(section.id),
      starts: section.startsHidden,
    })),
  ];
  return new Set(
    filters.filter(({ id, starts }) => starts !== flipped.has(id)).map(({ id }) => id),
  );
}

/** The key of a lane's frame of agent rows: ticketless agents, and in Done the free agents moved there. */
export const agentsKey = (lane: StageLane) => `__agents:${lane}`;
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
/** The lane's dashed border, which its border-box height includes on both edges. */
export const LANE_BORDER = 1;
/** A taller lane scrolls its cards. 720 canvas px fits about eleven ticket cards or one merge card. */
export const LANE_MAX_HEIGHT = 720;
export const FRAME_WIDTH = LANE_WIDTH - LANE_PAD * 2;
export const FRAME_GAP = 8;
/** Every ticket card, and every unassigned agent row, is two lines this tall. */
export const CARD_HEIGHT = 52;
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

/** A lane's frame of agent rows, padded on every side. */
export const agentsHeight = (rows: number): number =>
  2 * FRAME_PAD + rows * CARD_HEIGHT + (rows - 1) * CARD_GAP;

/** Frames the user never dragged on top, in the order given, then the rest in the order the user dragged them to. */
export function orderedKeys(keys: ReadonlyArray<string>, saved: ReadonlyArray<string> = []) {
  const present = new Set(keys);
  const kept = saved.filter((key) => present.has(key));
  const placed = new Set(kept);
  return [...keys.filter((key) => !placed.has(key)), ...kept];
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
const NO_AGENTS = { todo: 0, running: 0, waiting: 0, done: 0 };

/** Later lanes pack left over a hidden one. */
export function layoutBoard(
  model: BoardModel,
  order: FrameOrder,
  forYouRows = 0,
  hidden: ReadonlySet<string> = NO_HIDDEN,
  additions: ReadonlyArray<Addition> = [],
  problemLines = 0,
  agentRows: Readonly<Record<StageLane, number>> = NO_AGENTS,
  now = 0,
): Layout {
  const lines = additions.filter((item) => item.place === "orchestrator").length + problemLines;
  const top = LANES_TOP + lines * ADDITION_LINE;
  const lanes: LaneBox[] = [];
  LANE_IDS.forEach((id) => {
    if (hidden.has(id)) return;
    const x = LEFT + lanes.length * (LANE_WIDTH + LANE_GAP);
    const items: Array<{ key: string; height: number }> = [];
    if (id !== "for_you") {
      for (const card of additions) {
        if (card.place === "lane" && ticketLane(card.lane, false) === id) {
          items.push({ key: ADDITION_KEY + card.id, height: ADDITION_FRAME });
        }
      }
      if (agentRows[id] > 0)
        items.push({ key: agentsKey(id), height: agentsHeight(agentRows[id]) });
      const keys = TICKET_STAGES.filter((stage) => !hidden.has(stageTagId(stage)))
        .flatMap((stage) =>
          model.lanes[stage].filter(
            (view) => ticketLane(stage, isWorking(view.agents, now)) === id,
          ),
        )
        .toSorted((a, b) => b.position - a.position)
        .map((view) => view.ticket.key);
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
      height: Math.min(LANE_MAX_HEIGHT, Math.max(LANE_MIN_HEIGHT, bottom - top)),
      frames,
    });
  });
  const additionLanes = additions
    .filter((item) => item.place === "canvas")
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

/** The height of a lane's cards in its scroll box, which equals the box when the lane is not capped. */
export function laneCardsHeight(lane: LaneBox): number {
  const last = lane.frames.at(-1);
  if (last === undefined) return 0;
  return last.y + last.height + LANE_PAD - lane.y - 2 * LANE_BORDER - LANE_HEAD;
}

const EDGE_PX = 24;
const EDGE_STEP_MAX = 24;

/** Local px to scroll a lane per tick while a dragged card's pointer is within `EDGE_PX` of its top or bottom. */
export function edgeScrollStep(clientY: number, top: number, bottom: number): number {
  const depth =
    clientY < top + EDGE_PX
      ? clientY - top - EDGE_PX
      : clientY > bottom - EDGE_PX
        ? clientY - bottom + EDGE_PX
        : 0;
  if (depth === 0) return 0;
  return (
    Math.sign(depth) *
    Math.max(1, Math.round(Math.min(1, Math.abs(depth) / EDGE_PX) * EDGE_STEP_MAX))
  );
}

/** How far a frame may be dragged and stay among its lane's frames, which may run past a scrolling lane. */
export function clampDrag(lane: LaneBox, frame: FrameBox, dy: number): number {
  const min = lane.y + LANE_HEAD - frame.y;
  const last = lane.frames.at(-1) ?? frame;
  const max = last.y + last.height - frame.height - frame.y;
  return Math.min(Math.max(dy, min), Math.max(min, max));
}

/** The canvas content grown to cover cards placed freely on it. */
export function withCards(
  content: Rect,
  cards: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  size: { readonly width: number; readonly height: number },
): Rect {
  if (cards.length === 0) return content;
  const xs = cards.map((card) => card.x);
  const ys = cards.map((card) => card.y);
  const x = Math.min(content.x, ...xs.map((value) => value - LEFT));
  const y = Math.min(content.y, ...ys.map((value) => value - LEFT));
  const right = Math.max(
    content.x + content.width,
    ...xs.map((value) => value + size.width + LEFT),
  );
  const bottom = Math.max(
    content.y + content.height,
    ...ys.map((value) => value + size.height + LEFT),
  );
  return { x, y, width: right - x, height: bottom - y };
}

/** A free card's place, moved to just below the lanes when the card would cover one. */
export function besideLanes(
  at: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  layout: Layout,
): { x: number; y: number } {
  const boxes = [...layout.lanes, ...layout.additionLanes];
  if (boxes.length === 0) return at;
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const covers =
    at.x < right && at.x + size.width > left && at.y < bottom && at.y + size.height > top;
  return covers ? { x: at.x, y: bottom + LEFT } : { x: at.x, y: at.y };
}

/** The number a lane's header shows: its ticket frames and its agent rows, or the For you lane's open items. */
export function laneCount(
  lane: LaneBox,
  views: ReadonlyMap<string, unknown>,
  forYouOpen: number,
  agentRows: Readonly<Record<StageLane, number>>,
) {
  const id = lane.id;
  if (id === "for_you") return forYouOpen;
  const rows = (key: string) => {
    if (key === agentsKey(id)) return agentRows[id];
    return views.has(key) ? 1 : 0;
  };
  return lane.frames.reduce((count, frame) => count + rows(frame.key), 0);
}
