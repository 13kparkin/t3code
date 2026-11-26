import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { MoreHorizontal, Plus } from "lucide-react";
import { type MouseEvent, useContext, useState } from "react";

import { LANE_HEAD, LANE_WIDTH } from "../board/layout";
import type { CallEvent, CardState } from "../domain/board";
import { deleteAudio, recordCall, recorderAtom, startingCallsAtom } from "../state/recorder";
import { CALL_APPS } from "./CallEditor";
import { callAudio } from "./recorder";

export const START = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The calls recording or starting now and the next one, with the later ones behind a toggle, Done
 * calls marked. It stretches to the orchestrator card's height and scrolls inside.
 */
export function CallCards({
  boardId,
  shown,
  later,
  states,
  onAdd,
  onMenu,
}: {
  boardId: string;
  shown: ReadonlyArray<CallEvent>;
  later: ReadonlyArray<CallEvent>;
  states: Readonly<{ [key: string]: CardState }>;
  onAdd: () => void;
  onMenu: (event: MouseEvent, call: CallEvent) => void;
}) {
  const registry = useContext(RegistryContext);
  const recorder = useAtomValue(recorderAtom);
  const starting = useAtomValue(startingCallsAtom);
  const [all, setAll] = useState(false);
  const listed = all ? [...shown, ...later] : shown;
  const state = recorder?.state;
  return (
    <section
      aria-label="Calls"
      data-testid="calls"
      onPointerDown={(event) => event.stopPropagation()}
      className="relative shrink-0 rounded-xl border border-dashed border-line"
      style={{ width: LANE_WIDTH }}
    >
      {/* Out of flow, so the card's height, not this list, sets the row's height. */}
      <div className="absolute inset-0 flex flex-col">
        <header className="flex shrink-0 items-center gap-1.5 px-3" style={{ height: LANE_HEAD }}>
          <span className="rounded-md px-2 text-[11px] leading-5 font-semibold text-muted">
            Calls
          </span>
          <span className="text-[11px] text-faint">{shown.length + later.length}</span>
          <span className="flex-1" />
          {later.length > 0 && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="rounded px-1.5 text-[11px] text-faint hover:bg-hover hover:text-fg"
            >
              {all ? "Show less" : `${later.length} more`}
            </button>
          )}
          <button
            type="button"
            aria-label="Add call"
            onClick={onAdd}
            className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </header>
        <ul
          data-scroll
          className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {listed.length === 0 && <li className="text-[11px] text-faint">No calls coming up.</li>}
          {listed.map((call) => {
            const done = states[call.id] === "done";
            const live = state?.status !== "idle" && state?.callId === call.id;
            const failed =
              state?.status === "idle" && state.failed?.callId === call.id ? state.failed : null;
            const audio = recorder === null ? null : callAudio(recorder.recordings, call.id);
            return (
              <li
                key={call.id}
                data-testid="call-card"
                data-call={call.id}
                onContextMenu={(event) => onMenu(event, call)}
                className={`flex flex-col gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 shadow-panel ${done ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{call.title}</p>
                    <p className="truncate text-[11px] text-muted">
                      {START.format(new Date(call.start))} · {CALL_APPS[call.app].title}
                      {done ? " · Done" : ""}
                    </p>
                  </div>
                  {live ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-red-400">
                      <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
                      {state?.status === "starting" ? "Starting" : "Recording"}
                    </span>
                  ) : (
                    // v1 records Chrome only, the one app verified on Windows.
                    recorder !== null &&
                    call.app === "chrome" && (
                      <>
                        {starting.has(call.id) && (
                          <span className="shrink-0 text-[11px] text-amber-300">Starting now</span>
                        )}
                        <button
                          type="button"
                          disabled={state?.status !== "idle"}
                          onClick={() =>
                            void recordCall(registry, {
                              callId: call.id,
                              boardId,
                              title: call.title,
                              app: call.app,
                            })
                          }
                          className="shrink-0 rounded px-1.5 text-[11px] text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
                        >
                          Record
                        </button>
                      </>
                    )
                  )}
                  <button
                    type="button"
                    aria-label={`${call.title} actions`}
                    onClick={(event) => onMenu(event, call)}
                    className="grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden />
                  </button>
                </div>
                {failed !== null && (
                  <p role="alert" className="text-[11px] break-words text-red-400">
                    {failed.message}
                  </p>
                )}
                {audio !== null && (
                  <p
                    data-testid="call-audio"
                    className="flex items-center gap-1 text-[11px] text-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      Audio on this PC · {audio.minutes} min
                      {audio.note === null ? "" : ` · ${audio.note}`}
                    </span>
                    {!live && (
                      <button
                        type="button"
                        onClick={() => deleteAudio(call.id)}
                        className="shrink-0 rounded px-1.5 text-faint hover:bg-hover hover:text-fg"
                      >
                        Delete audio
                      </button>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
