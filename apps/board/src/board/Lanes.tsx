import { RegistryContext } from "@effect/atom-react";
import { EyeOff } from "lucide-react";
import { type ReactNode, useContext, useState } from "react";

import type { BoardModel } from "../state/boardModel";
import { usePrContext } from "../state/prStatus";
import type { TicketChoice } from "../browser/panel";
import { laneKey, saveFrameOrder, toggleFolded } from "../state/boardUi";
import { Tooltip } from "../ui/Tooltip";
import { ago } from "../ui/ago";
import { AdditionBlocks } from "./AdditionBlocks";
import { CardLine } from "./CardLine";
import {
  ADDITION_KEY,
  additionLaneId,
  clampDrag,
  edgePath,
  type FrameBox,
  type LaneBox,
  type LaneId,
  type Layout,
  LANE_HEAD,
  LANE_LABEL,
  reorderByDrag,
  UNASSIGNED_HEAD,
  UNASSIGNED_KEY,
  CARD_GAP,
  CARD_HEIGHT,
  FRAME_PAD,
} from "./layout";
import { RemoveAddition } from "./RemoveAddition";
import { TicketFrame } from "./TicketFrame";
import { ticketStatus } from "./ticketStatus";

const LANE_TONE = {
  for_you: "bg-amber-500 text-black",
  todo: "bg-zinc-700 text-white",
  planned: "bg-zinc-600 text-white",
  building: "bg-blue-600 text-white",
  reviewing: "bg-violet-600 text-white",
  verifying: "bg-cyan-600 text-white",
  pr: "bg-indigo-600 text-white",
  awaiting_approval: "bg-orange-600 text-white",
  merged: "bg-emerald-600 text-white",
  unassigned: "bg-red-600 text-white",
} as const satisfies Record<LaneId, string>;

/** Every lane on the canvas, its ticket frames with their agents, and the edges between dependent tickets. */
export function Lanes({
  layout,
  model,
  boardId,
  forYouOpen,
  queued,
  forYouLane,
  choice,
  onChoose,
  onRemoveAddition,
}: {
  layout: Layout;
  model: BoardModel;
  boardId: string;
  forYouOpen: number;
  queued: boolean;
  forYouLane: ReactNode;
  choice: TicketChoice | null;
  onChoose: (choice: TicketChoice) => void;
  onRemoveAddition: (id: string) => void;
}) {
  const registry = useContext(RegistryContext);
  const additions = new Map(usePrContext().additions.map((item) => [item.id, item]));
  const [drag, setDrag] = useState<{ key: string; dy: number } | null>(null);
  const views = new Map(
    Object.values(model.lanes)
      .flat()
      .map((view) => [view.ticket.key, view]),
  );
  const boxes = new Map(layout.lanes.flatMap((lane) => lane.frames).map((box) => [box.key, box]));
  // The frame under the pointer moves, and its edges follow.
  const moved = (box: FrameBox): FrameBox =>
    drag?.key === box.key ? { ...box, y: box.y + drag.dy } : box;

  const drop = (lane: LaneBox) => {
    if (drag === null) return;
    const order = reorderByDrag(lane, drag.key, drag.dy);
    setDrag(null);
    void saveFrameOrder(registry, boardId, lane.id, order);
  };

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={layout.content.width}
        height={layout.content.height}
      >
        <defs>
          <marker
            id="edge-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-muted)" />
          </marker>
        </defs>
        {layout.edges.map((edge) => {
          const from = boxes.get(edge.from);
          const to = boxes.get(edge.to);
          if (from === undefined || to === undefined) return null;
          return (
            <path
              key={`${edge.from}>${edge.to}`}
              data-edge={`${edge.from}>${edge.to}`}
              d={edgePath(moved(from), moved(to))}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={1.5}
              markerEnd="url(#edge-arrow)"
            />
          );
        })}
      </svg>
      {layout.lanes.map((lane) => (
        <section
          key={lane.id}
          aria-label={`${LANE_LABEL[lane.id]} lane`}
          data-testid="lane"
          data-lane={lane.id}
          className="absolute rounded-xl border border-dashed border-line"
          style={{
            left: lane.x,
            top: lane.y,
            width: lane.width,
            // The For-you lane grows with its cards, whose heights the layout only estimates.
            ...(lane.id === "for_you" ? { minHeight: lane.height } : { height: lane.height }),
          }}
        >
          <header className="flex items-center gap-1.5 px-3" style={{ height: LANE_HEAD }}>
            <span
              className={`rounded-md px-2 text-[11px] leading-5 font-semibold ${LANE_TONE[lane.id]}`}
            >
              {LANE_LABEL[lane.id]}
              {lane.id === "planned" && queued ? " · queued" : ""}
            </span>
            <span className="text-[11px] text-faint">{laneCount(lane, model, forYouOpen)}</span>
            <span className="flex-1" />
            <Tooltip text="Hide lane" side="bottom" align="end">
              <button
                type="button"
                aria-label={`Hide the ${LANE_LABEL[lane.id]} lane`}
                // A press here is a click, not the start of a pan.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => void toggleFolded(registry, laneKey(boardId, lane.id))}
                className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
              >
                <EyeOff className="size-3" aria-hidden />
              </button>
            </Tooltip>
          </header>
          {lane.id === "for_you" && forYouLane}
        </section>
      ))}
      {layout.additionLanes.map((box) => {
        const item = additions.get(box.key);
        if (item === undefined) return null;
        return (
          <section
            key={box.key}
            aria-label={`${item.title} lane`}
            data-testid="lane"
            data-lane={additionLaneId(item.id)}
            className="absolute flex flex-col rounded-xl border border-dashed border-line"
            style={{ left: box.x, top: box.y, width: box.width, minHeight: box.height }}
          >
            <header
              className="flex shrink-0 items-center gap-1.5 px-3"
              style={{ height: LANE_HEAD }}
            >
              <span className="min-w-0 truncate rounded-md bg-zinc-800 px-2 text-[11px] leading-5 font-semibold text-white">
                {item.title}
              </span>
              <span className="flex-1" />
              <Tooltip text="Hide lane" side="bottom" align="end">
                <button
                  type="button"
                  aria-label={`Hide the ${item.title} lane`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() =>
                    void toggleFolded(registry, laneKey(boardId, additionLaneId(item.id)))
                  }
                  className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
                >
                  <EyeOff className="size-3" aria-hidden />
                </button>
              </Tooltip>
              <RemoveAddition item={item} onRemove={() => onRemoveAddition(item.id)} />
            </header>
            <div
              data-testid="addition-card"
              data-scroll
              onPointerDown={(event) => event.stopPropagation()}
              className="min-h-0 overflow-y-auto px-3 pb-3 text-[12px]"
            >
              <AdditionBlocks item={item} />
            </div>
          </section>
        );
      })}
      {layout.lanes.flatMap((lane) =>
        lane.frames.map((box) => {
          const added = box.key.startsWith(ADDITION_KEY)
            ? additions.get(box.key.slice(ADDITION_KEY.length))
            : undefined;
          if (added !== undefined) {
            return (
              <section
                key={box.key}
                aria-label={added.title}
                data-testid="addition-card"
                className="absolute flex flex-col rounded-lg border border-line bg-panel shadow-panel"
                style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
              >
                <header className="flex shrink-0 items-center gap-1.5 px-2.5 pt-1.5">
                  <h4 className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                    {added.title}
                  </h4>
                  <RemoveAddition item={added} onRemove={() => onRemoveAddition(added.id)} />
                </header>
                <div
                  data-scroll
                  onPointerDown={(event) => event.stopPropagation()}
                  className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 text-[12px]"
                >
                  <AdditionBlocks item={added} />
                </div>
              </section>
            );
          }
          if (box.key === UNASSIGNED_KEY) {
            return (
              <section
                key={box.key}
                aria-label="Unassigned agents"
                data-testid="unassigned"
                className="absolute rounded-lg border border-line bg-panel shadow-panel"
                style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
              >
                <p
                  className="px-2.5 pt-2 text-[11px] text-faint"
                  style={{ height: UNASSIGNED_HEAD }}
                >
                  Started with no ticket
                </p>
                <div
                  className="flex flex-col"
                  style={{ gap: CARD_GAP, padding: `0 ${FRAME_PAD}px ${FRAME_PAD}px` }}
                >
                  {model.unassigned.map((agent) => (
                    <button
                      key={agent.threadId}
                      type="button"
                      aria-pressed={agent.threadId === choice?.threadId}
                      // A press that starts on a row is a click, not the start of a pan.
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onChoose({ threadId: agent.threadId, ticketKey: null })}
                      style={{ height: CARD_HEIGHT }}
                      className={`flex shrink-0 flex-col justify-center gap-1 rounded-md border bg-bg px-2.5 text-left hover:bg-hover ${agent.threadId === choice?.threadId ? "border-focus" : "border-line"}`}
                    >
                      <CardLine
                        tag={null}
                        title={agent.title}
                        status={ticketStatus([agent])}
                        detail={`${agent.role} · ${ago(agent.updatedAt)}`}
                      />
                    </button>
                  ))}
                </div>
              </section>
            );
          }
          const view = views.get(box.key);
          if (view === undefined) return null;
          return (
            <TicketFrame
              key={box.key}
              view={view}
              box={box}
              offset={drag?.key === box.key ? drag.dy : 0}
              selected={choice?.ticketKey === box.key}
              onDrag={(dy) => setDrag({ key: box.key, dy: clampDrag(lane, box, dy) })}
              onDrop={() => drop(lane)}
              onOpen={() =>
                onChoose({ threadId: view.agents[0]?.threadId ?? null, ticketKey: box.key })
              }
            />
          );
        }),
      )}
    </>
  );
}

function laneCount(lane: LaneBox, model: BoardModel, forYouOpen: number): number {
  if (lane.id === "for_you") return forYouOpen;
  return lane.id === "unassigned" ? model.unassigned.length : model.lanes[lane.id].length;
}
