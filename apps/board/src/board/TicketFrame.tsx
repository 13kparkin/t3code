import { type MouseEvent, useRef } from "react";

import { missingPlan, missingSources, STAGE_LABEL } from "../domain/ticket";
import { waitingOn } from "../domain/ticketOverlay";
import { usePrContext, useTicketNotes } from "../state/prStatus";
import type { TicketView } from "../state/boardModel";
import { ago } from "../ui/ago";
import { CardLine } from "./CardLine";
import { edgeScrollStep, type FrameBox, STAGE_TAGS } from "./layout";
import { newestAgent, ticketStatus } from "./ticketStatus";
import { useViewScale } from "./Viewport";

const DRAG_THRESHOLD_PX = 4;
const EDGE_TICK_MS = 80;

interface Press {
  readonly startY: number;
  readonly lane: HTMLElement | null;
  readonly startScroll: number;
  reportedScroll: number;
  clientY: number;
  dragging: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

/** A ticket on its lane as two lines. The whole card drags; a press that did not drag opens the ticket. */
export function TicketFrame({
  view,
  box,
  now,
  offset,
  selected,
  onDrag,
  onDrop,
  onOpen,
  onMenu,
}: {
  view: TicketView;
  box: FrameBox;
  now: number;
  /** How far the frame is dragged from its place, in canvas px. */
  offset: number;
  selected: boolean;
  onDrag: (dy: number) => void;
  onDrop: () => void;
  onOpen: () => void;
  onMenu: (event: MouseEvent) => void;
}) {
  const { ticket, agents } = view;
  const scale = useViewScale();
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);
  const newest = newestAgent(agents);
  const tag = STAGE_TAGS[ticket.stage];
  const { tickets } = usePrContext();
  const notes = useTicketNotes(view);
  const waiting =
    ticket.stage === "merged" || ticket.stage === "off_path"
      ? []
      : waitingOn(
          ticket,
          tickets.map((entry) => entry.ticket),
        );
  const stopEdgeScroll = () => {
    if (press.current?.timer != null) clearInterval(press.current.timer);
  };
  // The lane may have scrolled since the press, so its scroll joins the pointer's travel.
  const report = (active: Press) => {
    active.reportedScroll = active.lane?.scrollTop ?? 0;
    onDrag((active.clientY - active.startY) / scale + active.reportedScroll - active.startScroll);
  };
  const end = () => {
    stopEdgeScroll();
    if (press.current?.dragging) {
      dragged.current = true;
      onDrop();
    }
    press.current = null;
  };

  return (
    <button
      type="button"
      data-testid="ticket-frame"
      data-ticket={ticket.key}
      data-stage={ticket.stage}
      aria-label={`${ticket.key} ${ticket.title}`}
      aria-pressed={selected}
      className={`absolute flex cursor-grab touch-none flex-col justify-center gap-1 rounded-lg border bg-panel px-2.5 text-left shadow-panel select-none hover:bg-hover ${selected ? "border-focus" : "border-line"} ${offset === 0 ? "" : "z-10 opacity-95"}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transform: offset === 0 ? undefined : `translateY(${offset}px)`,
      }}
      // The card drags on its own, so a press here never pans the canvas.
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        dragged.current = false;
        const lane = event.currentTarget.closest<HTMLElement>("[data-lane-scroll]");
        press.current = {
          startY: event.clientY,
          lane,
          startScroll: lane?.scrollTop ?? 0,
          reportedScroll: lane?.scrollTop ?? 0,
          clientY: event.clientY,
          dragging: false,
          timer: null,
        };
      }}
      onPointerMove={(event) => {
        const active = press.current;
        if (active === null) return;
        active.clientY = event.clientY;
        if (!active.dragging && Math.abs(event.clientY - active.startY) < DRAG_THRESHOLD_PX) return;
        if (!active.dragging) {
          active.dragging = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        report(active);
        const lane = active.lane;
        const card = event.currentTarget;
        if (lane === null || active.timer !== null) return;
        active.timer = setInterval(() => {
          if (!card.isConnected) {
            if (active.timer !== null) clearInterval(active.timer);
            return;
          }
          const rect = lane.getBoundingClientRect();
          const step = edgeScrollStep(active.clientY, rect.top, rect.bottom);
          if (step !== 0) lane.scrollTop += step;
          if (lane.scrollTop !== active.reportedScroll) report(active);
        }, EDGE_TICK_MS);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={onMenu}
      onClick={() => {
        if (!dragged.current) onOpen();
        dragged.current = false;
      }}
    >
      <CardLine
        tag={ticket.key}
        title={ticket.title}
        status={ticketStatus(agents, now)}
        detail={
          <>
            <span
              data-testid="stage-tag"
              className={`mr-1.5 rounded bg-hover px-1 text-[10px] leading-4 ${tag.tone}`}
            >
              {STAGE_LABEL[ticket.stage]}
            </span>
            {waiting.length > 0 && (
              <span data-testid="waiting-tag" className="text-amber-300">
                {`Waiting on ${waiting.join(", ")} · `}
              </span>
            )}
            {missingPlan(ticket) && <span className="text-amber-300">No plan · </span>}
            {missingSources(ticket, notes) && (
              <span data-testid="no-sources" className="text-amber-300">
                No sources ·{" "}
              </span>
            )}
            {newest === undefined ? "No agents" : `${newest.role} · ${ago(newest.updatedAt)}`}
          </>
        }
      />
    </button>
  );
}
