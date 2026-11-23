import { useRef } from "react";

import type { TicketView } from "../state/boardModel";
import { AgentCard } from "./AgentCard";
import { CARD_GAP, FRAME_PAD, type FrameBox } from "./layout";
import { useViewScale } from "./Viewport";

const DRAG_THRESHOLD_PX = 4;

/** A ticket on its lane: what it is, where its work lives, its reviews, and the agents on it. */
export function TicketFrame({
  view,
  box,
  offset,
  selectedThreadId,
  onDrag,
  onDrop,
  onOpen,
}: {
  view: TicketView;
  box: FrameBox;
  /** How far the frame is dragged from its place, in canvas px. */
  offset: number;
  selectedThreadId: string | null;
  onDrag: (dy: number) => void;
  onDrop: () => void;
  onOpen: (threadId: string | null) => void;
}) {
  const { ticket, agents } = view;
  const scale = useViewScale();
  const press = useRef<{ startY: number; dragging: boolean } | null>(null);

  return (
    <article
      data-testid="ticket-frame"
      data-ticket={ticket.key}
      aria-label={`${ticket.key} ${ticket.title}`}
      className={`absolute rounded-lg border border-line bg-panel shadow-panel ${offset === 0 ? "" : "z-10 opacity-95"}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transform: offset === 0 ? undefined : `translateY(${offset}px)`,
      }}
    >
      <header
        data-testid="frame-handle"
        className="cursor-grab touch-none px-2.5 pt-2.5 select-none"
        style={{ height: box.head }}
        // The frame drags on its own, so a press here never pans the canvas.
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
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
        onPointerUp={() => {
          if (press.current?.dragging) onDrop();
          press.current = null;
        }}
        onPointerCancel={() => {
          if (press.current?.dragging) onDrop();
          press.current = null;
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-hover px-1.5 font-mono text-[11px] leading-[18px] font-semibold text-fg">
            {ticket.key}
          </span>
          {ticket.track != null && (
            <span className="min-w-0 truncate text-[11px] text-faint">{ticket.track}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpen(agents[0]?.threadId ?? null)}
          className="mt-1.5 line-clamp-2 h-[38px] w-full text-left text-[13px] leading-[19px] font-semibold text-fg"
        >
          {ticket.title}
        </button>
      </header>
      <div className="flex flex-col" style={{ gap: CARD_GAP, padding: FRAME_PAD }}>
        {agents.length === 0 ? (
          <p className="px-1 text-[11px] text-faint">No agents yet</p>
        ) : (
          agents.map((agent) => (
            <AgentCard
              key={agent.threadId}
              agent={agent}
              ticket={ticket}
              selected={agent.threadId === selectedThreadId}
              onOpen={() => onOpen(agent.threadId)}
            />
          ))
        )}
      </div>
    </article>
  );
}
