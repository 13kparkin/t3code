import { RegistryContext } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { ArrowUp, MoreHorizontal, Square } from "lucide-react";
import {
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  useContext,
  useRef,
  useState,
} from "react";

import { agentFile, dropOnComposer } from "../chat/cardAttachment";
import { isRunLive } from "../chat/timeline";
import type { FreeAgent } from "../domain/board";
import { failureText } from "../settings/failureText";
import { newId } from "../state/boards";
import { freeAgentLabel } from "../state/cardStates";
import { interruptTurn, startTurn, useEnvironmentThread } from "../state/threads";
import { AgentLog } from "./AgentLog";
import type { CardStatus } from "./ticketStatus";
import { useViewScale } from "./Viewport";

export const FREE_CARD = { width: 320, height: 380 } as const;
const DRAG_THRESHOLD_PX = 4;

/** An agent the user started on the canvas and talks to here, not through the orchestrator. Its header drags it, or into the chat. */
export function FreeAgentCard({
  environmentId,
  agent,
  status,
  place,
  onMove,
  onMenu,
}: {
  environmentId: EnvironmentId;
  agent: FreeAgent;
  /** The card's status word, from the thread's row in the engine's shell. */
  status: CardStatus | null;
  place: (at: { x: number; y: number }) => { x: number; y: number };
  onMove: (at: { readonly x: number; readonly y: number }) => void;
  onMenu: (event: MouseEvent) => void;
}) {
  const registry = useContext(RegistryContext);
  const scale = useViewScale();
  const threadId = ThreadId.make(agent.threadId);
  const projection = Option.getOrNull(useEnvironmentThread(environmentId, threadId).data);
  const live = projection !== null && isRunLive(projection);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  // Holds the dropped place until the saved board comes back with it.
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);
  const at = place(placed ?? agent);

  const settle = async (pending: ReturnType<typeof runAtomCommand>) => {
    setError(null);
    const result = await pending;
    if (result._tag !== "Success") setError(failureText(result));
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || projection === null) return;
    setDraft("");
    void settle(
      runAtomCommand(
        registry,
        startTurn,
        {
          environmentId,
          input: {
            threadId,
            message: { messageId: MessageId.make(newId()), role: "user", text, attachments: [] },
            runtimeMode: projection.thread.runtimeMode,
            interactionMode: projection.thread.interactionMode,
            ...(live ? { dispatchMode: "queue" as const } : {}),
          },
        },
        { reportFailure: false },
      ),
    );
  };

  const end = (release: PointerEvent | null) => {
    const attached =
      release !== null &&
      offset !== null &&
      dropOnComposer(
        release.clientX,
        release.clientY,
        agentFile({ threadId: agent.threadId, title: freeAgentLabel(agent.threadId) }),
      );
    if (offset !== null && !attached) {
      const next = { x: at.x + offset.dx, y: at.y + offset.dy };
      setPlaced(next);
      onMove(next);
    }
    press.current = null;
    setOffset(null);
  };

  return (
    <section
      aria-label="Agent card"
      data-testid="free-agent"
      data-thread={agent.threadId}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={onMenu}
      className={`absolute flex flex-col rounded-xl border border-line bg-panel shadow-panel ${offset === null ? "" : "z-10"}`}
      style={{
        left: at.x,
        top: at.y,
        width: FREE_CARD.width,
        maxHeight: FREE_CARD.height,
        transform: offset === null ? undefined : `translate(${offset.dx}px, ${offset.dy}px)`,
      }}
    >
      <header
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b border-line px-3 select-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          press.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = press.current;
          if (start === null) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (offset === null && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          setOffset({ dx: dx / scale, dy: dy / scale });
        }}
        onPointerUp={end}
        onPointerCancel={() => end(null)}
      >
        <h3 className="min-w-0 flex-1 truncate font-semibold">
          {projection?.thread.title ?? "Agent"}
        </h3>
        <span data-testid="card-status" className="shrink-0 text-[11px] text-muted">
          {status?.word ?? "Connecting"}
        </span>
        <button
          type="button"
          aria-label="Agent card actions"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onMenu}
          className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </button>
      </header>
      <div data-scroll className="flex min-h-0 flex-auto flex-col">
        <AgentLog environmentId={environmentId} threadId={agent.threadId} role="Agent" />
      </div>
      {error !== null && (
        <p role="alert" className="px-3 text-[11px] break-words text-red-400">
          {error}
        </p>
      )}
      <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-line p-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)
              send(event);
          }}
          rows={1}
          placeholder="Message this agent"
          aria-label="Message this agent"
          className="field-sizing-content max-h-24 min-h-7 min-w-0 flex-1 resize-none bg-transparent text-fg outline-none placeholder:text-faint"
        />
        {live && draft.trim() === "" ? (
          <button
            type="button"
            aria-label="Stop"
            onClick={() =>
              void settle(
                runAtomCommand(
                  registry,
                  interruptTurn,
                  { environmentId, input: { threadId } },
                  { reportFailure: false },
                ),
              )
            }
            className="grid size-7 shrink-0 place-items-center rounded-full bg-fg text-bg"
          >
            <Square className="size-3" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={draft.trim() === "" || projection === null}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-fg text-bg disabled:opacity-50"
          >
            <ArrowUp className="size-3.5" aria-hidden />
          </button>
        )}
      </form>
    </section>
  );
}
