import { RegistryContext } from "@effect/atom-react";
import { EyeOff } from "lucide-react";
import { type MouseEvent, type ReactNode, useContext, useRef, useState } from "react";

import { agentFile, dropOnComposer } from "../chat/cardAttachment";
import type { FreeAgent } from "../domain/board";
import type { AgentView, BoardModel } from "../state/boardModel";
import { freeAgentLabel } from "../state/cardStates";
import { usePrContext } from "../state/prStatus";
import type { TicketChoice } from "../browser/panel";
import { laneKey, saveFrameOrder, toggleFolded } from "../state/boardUi";
import { Tooltip } from "../ui/Tooltip";
import { ago } from "../ui/ago";
import { AdditionBlocks } from "./AdditionBlocks";
import { activeAgentOf } from "./activeAgent";
import { CardLine } from "./CardLine";
import {
  ADDITION_KEY,
  additionLaneId,
  agentsKey,
  clampDrag,
  type FrameBox,
  type LaneBox,
  type LaneId,
  type Layout,
  LANE_BORDER,
  LANE_HEAD,
  LANE_LABEL,
  LANE_MAX_HEIGHT,
  laneCardsHeight,
  laneCount,
  reorderByDrag,
  type StageLane,
  CARD_GAP,
  CARD_HEIGHT,
  FRAME_PAD,
} from "./layout";
import { RemoveAddition } from "./RemoveAddition";
import { TicketFrame } from "./TicketFrame";
import { ticketStatus } from "./ticketStatus";

const DRAG_THRESHOLD_PX = 4;

const LANE_TONE = {
  for_you: "bg-amber-500 text-black",
  todo: "bg-zinc-700 text-white",
  running: "bg-blue-600 text-white",
  waiting: "bg-amber-700 text-white",
  done: "bg-emerald-700 text-white",
} as const satisfies Record<LaneId, string>;

export function Lanes({
  layout,
  model,
  boardId,
  forYouOpen,
  queued,
  forYouLane,
  choice,
  onChoose,
  onOpenAgent,
  onRemoveAddition,
  agents,
  doneFree,
  agentRows,
  onCardMenu,
  now,
}: {
  layout: Layout;
  model: BoardModel;
  boardId: string;
  forYouOpen: number;
  queued: boolean;
  forYouLane: ReactNode;
  choice: TicketChoice | null;
  onChoose: (choice: TicketChoice) => void;
  onOpenAgent: (threadId: string, ticketKey: string | null) => void;
  onRemoveAddition: (id: string) => void;
  agents: Readonly<Record<StageLane, ReadonlyArray<AgentView>>>;
  doneFree: ReadonlyArray<FreeAgent>;
  agentRows: Readonly<Record<StageLane, number>>;
  onCardMenu: (event: MouseEvent, key: string, label: string, ticket: boolean) => void;
  now: number;
}) {
  const registry = useContext(RegistryContext);
  const additions = new Map(usePrContext().additions.map((item) => [item.id, item]));
  const [drag, setDrag] = useState<{ key: string; dy: number } | null>(null);
  const rowPress = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const views = new Map(
    Object.values(model.lanes)
      .flat()
      .map((view) => [view.ticket.key, view]),
  );

  const drop = (lane: LaneBox) => {
    if (drag === null) return;
    const order = reorderByDrag(lane, drag.key, drag.dy);
    setDrag(null);
    void saveFrameOrder(registry, boardId, lane.id, order);
  };

  const renderFrame = (lane: LaneBox, frame: FrameBox) => {
    // Frames sit in the lane's scroll box, so they draw from its corner inside the lane's border.
    const box = {
      ...frame,
      x: frame.x - lane.x - LANE_BORDER,
      y: frame.y - lane.y - LANE_BORDER - LANE_HEAD,
    };
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
            <h4 className="min-w-0 flex-1 truncate text-[12px] font-semibold">{added.title}</h4>
            <RemoveAddition title={added.title} onRemove={() => onRemoveAddition(added.id)} />
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
    if (lane.id !== "for_you" && box.key === agentsKey(lane.id)) {
      const rows = [
        ...agents[lane.id].map((agent) => ({
          threadId: agent.threadId,
          title: agent.title,
          role: agent.role,
          status: ticketStatus([agent], now),
          detail: `${agent.role} · ${ago(agent.updatedAt)}`,
        })),
        ...(lane.id === "done" ? doneFree : []).map((agent) => ({
          threadId: agent.threadId,
          title: freeAgentLabel(agent.threadId),
          status: null,
          detail: "Started on the canvas",
        })),
      ];
      return (
        <section
          key={box.key}
          aria-label={`${LANE_LABEL[lane.id]} agents`}
          data-testid="lane-agents"
          className="absolute rounded-lg border border-line bg-panel shadow-panel"
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        >
          <div className="flex flex-col" style={{ gap: CARD_GAP, padding: FRAME_PAD }}>
            {rows.map((row) => (
              <button
                key={row.threadId}
                type="button"
                aria-pressed={row.threadId === choice?.threadId}
                // A press on a row never pans the canvas.
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (event.button === 0)
                    rowPress.current = { x: event.clientX, y: event.clientY, moved: false };
                }}
                onPointerMove={(event) => {
                  const press = rowPress.current;
                  if (press === null || press.moved) return;
                  if (
                    Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD_PX
                  )
                    return;
                  press.moved = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={(event) => {
                  if (rowPress.current?.moved)
                    dropOnComposer(event.clientX, event.clientY, agentFile(row));
                }}
                onPointerCancel={() => {
                  rowPress.current = null;
                }}
                onClick={() => {
                  if (!rowPress.current?.moved) onOpenAgent(row.threadId, null);
                  rowPress.current = null;
                }}
                onContextMenu={(event) => onCardMenu(event, row.threadId, row.title, false)}
                style={{ height: CARD_HEIGHT }}
                className={`flex shrink-0 flex-col justify-center gap-1 rounded-md border bg-bg px-2.5 text-left hover:bg-hover ${row.threadId === choice?.threadId ? "border-focus" : "border-line"}`}
              >
                <CardLine tag={null} title={row.title} status={row.status} detail={row.detail} />
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
        now={now}
        offset={drag?.key === box.key ? drag.dy : 0}
        selected={choice?.ticketKey === box.key}
        onDrag={(dy) => setDrag({ key: box.key, dy: clampDrag(lane, frame, dy) })}
        onDrop={() => drop(lane)}
        onSentToChat={() => setDrag(null)}
        onMenu={(event) => onCardMenu(event, box.key, box.key, true)}
        onOpen={() => {
          const active = activeAgentOf(view.agents);
          if (active === undefined) {
            onChoose({ threadId: view.agents[0]?.threadId ?? null, ticketKey: box.key });
          } else onOpenAgent(active.threadId, box.key);
        }}
      />
    );
  };

  return (
    <>
      {layout.lanes.map((lane) => (
        <section
          key={lane.id}
          aria-label={`${LANE_LABEL[lane.id]} lane`}
          data-testid="lane"
          data-lane={lane.id}
          className="absolute flex flex-col rounded-xl border border-dashed border-line"
          style={{
            left: lane.x,
            top: lane.y,
            width: lane.width,
            // The For-you lane grows with its cards, whose heights the layout only estimates.
            ...(lane.id === "for_you"
              ? { minHeight: lane.height, maxHeight: LANE_MAX_HEIGHT }
              : { height: lane.height }),
          }}
        >
          <header className="flex shrink-0 items-center gap-1.5 px-3" style={{ height: LANE_HEAD }}>
            <span
              className={`rounded-md px-2 text-[11px] leading-5 font-semibold ${LANE_TONE[lane.id]}`}
            >
              {LANE_LABEL[lane.id]}
              {lane.id === "todo" && queued ? " · queued" : ""}
            </span>
            <span className="text-[11px] text-faint">
              {laneCount(lane, views, forYouOpen, agentRows)}
            </span>
            <span className="flex-1" />
            {lane.id === "for_you" && (
              <Tooltip text="Hide lane" side="bottom" align="end">
                <button
                  type="button"
                  aria-label="Hide the For you lane"
                  // A press here is a click, not the start of a pan.
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void toggleFolded(registry, laneKey(boardId, "for_you"))}
                  className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
                >
                  <EyeOff className="size-3" aria-hidden />
                </button>
              </Tooltip>
            )}
          </header>
          <div
            data-lane-scroll
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {lane.id === "for_you" ? (
              forYouLane
            ) : (
              <div className="relative" style={{ height: laneCardsHeight(lane) }}>
                {lane.frames.map((frame) => renderFrame(lane, frame))}
              </div>
            )}
          </div>
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
              <RemoveAddition title={item.title} onRemove={() => onRemoveAddition(item.id)} />
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
    </>
  );
}
