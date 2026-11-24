import { useRef } from "react";

import { missingPlan, STAGE_LABEL } from "../domain/ticket";
import type { TicketView } from "../state/boardModel";
import { ago } from "../ui/ago";
import { CardLine } from "./CardLine";
import { type FrameBox, STAGE_TAGS } from "./layout";
import { newestAgent, ticketStatus } from "./ticketStatus";
import { useViewScale } from "./Viewport";

const DRAG_THRESHOLD_PX = 4;

/** A ticket on its lane as two lines. The whole card drags; a press that did not drag opens the ticket. */
export function TicketFrame({
  view,
  box,
  offset,
  selected,
  onDrag,
  onDrop,
  onOpen,
}: {
  view: TicketView;
  box: FrameBox;
  /** How far the frame is dragged from its place, in canvas px. */
  offset: number;
  selected: boolean;
  onDrag: (dy: number) => void;
  onDrop: () => void;
  onOpen: () => void;
}) {
  const { ticket, agents } = view;
  const scale = useViewScale();
  const press = useRef<{ startY: number; dragging: boolean } | null>(null);
  const dragged = useRef(false);
  const newest = newestAgent(agents);
  const tag = STAGE_TAGS[ticket.stage];
  const end = () => {
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
      className={`absolute flex cursor-grab touch-none flex-col justify-center gap-1 rounded-lg border bg-panel px-2.5 text-left shadow-panel select-none hover:bg-hover ${selected ? "border-focus" : "border-line"} ${offset === 0 ? "" : "z-10 opacity-95"} ${tag.dim ? "opacity-60" : ""}`}
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
        press.current = { startY: event.clientY, dragging: false };
      }}
      onPointerMove={(event) => {
        const active = press.current;
        if (active === null) return;
        const moved = event.clientY - active.startY;
        if (!active.dragging && Math.abs(moved) < DRAG_THRESHOLD_PX) return;
        if (!active.dragging) {
          active.dragging = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        onDrag(moved / scale);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={() => {
        if (!dragged.current) onOpen();
        dragged.current = false;
      }}
    >
      <CardLine
        tag={ticket.key}
        title={ticket.title}
        status={ticketStatus(agents)}
        detail={
          <>
            <span
              data-testid="stage-tag"
              className={`mr-1.5 rounded bg-hover px-1 text-[10px] leading-4 ${tag.tone}`}
            >
              {STAGE_LABEL[ticket.stage]}
            </span>
            {missingPlan(ticket) && <span className="text-amber-300">No plan · </span>}
            {newest === undefined ? "No agents" : `${newest.role} · ${ago(newest.updatedAt)}`}
          </>
        }
      />
    </button>
  );
}
