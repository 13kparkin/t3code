import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Phone } from "lucide-react";
import { type MouseEvent, useContext, useRef, useState } from "react";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import { START } from "../calls/CallCards";
import type { CallEvent } from "../domain/board";
import { artifactAreasAtom, saveArtifactArea } from "../state/boardUi";
import { recorderAtom } from "../state/recorder";
import { ArtifactCard } from "./ArtifactCard";
import { ARTIFACT_GAP, ARTIFACT_HEIGHT, LANE_HEAD, LANE_MAX_HEIGHT, LANE_WIDTH } from "./layout";
import { useViewScale } from "./Viewport";

const MIN = { width: 216, height: 120 };
const MAX = { width: 4 * LANE_WIDTH, height: LANE_MAX_HEIGHT };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/**
 * The board's files and its finished recorded calls, as cards in a grid whose columns follow the
 * area's width. It matches the orchestrator card's height until its corner handle resizes it.
 */
export function ArtifactArea({
  boardId,
  calls,
  onCallMenu,
}: {
  boardId: string;
  calls: ReadonlyArray<CallEvent>;
  onCallMenu: (event: MouseEvent, call: CallEvent) => void;
}) {
  const registry = useContext(RegistryContext);
  const { groups } = useArtifacts();
  const saved = useAtomValue(artifactAreasAtom)[boardId];
  const snapshot = useAtomValue(recorderAtom);
  const scale = useViewScale();
  const box = useRef<HTMLElement>(null);
  const press = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [drag, setDrag] = useState<{ width: number; height: number } | null>(null);
  const size = drag ?? saved;
  const count = groups.board.length + calls.length;
  return (
    <section
      ref={box}
      aria-label="Artifacts"
      data-testid="artifact-area"
      onPointerDown={(event) => event.stopPropagation()}
      className="relative shrink-0 self-stretch rounded-xl border border-dashed border-line"
      style={{ width: size?.width ?? LANE_WIDTH, height: size?.height }}
    >
      {/* Out of flow, so the card's height, not this grid, sets the row's height. */}
      <div className="absolute inset-0 flex flex-col">
        <header className="flex shrink-0 items-center gap-1.5 px-3" style={{ height: LANE_HEAD }}>
          <span className="rounded-md px-2 text-[11px] leading-5 font-semibold text-muted">
            Artifacts
          </span>
          <span className="text-[11px] text-faint">{count}</span>
        </header>
        <ul
          data-scroll
          className="grid min-h-0 content-start overflow-y-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            gap: ARTIFACT_GAP,
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gridAutoRows: ARTIFACT_HEIGHT,
          }}
        >
          {count === 0 && <li className="text-[11px] text-faint">No artifacts yet.</li>}
          {groups.board.map((artifact) => (
            <li key={artifact.absolutePath} className="min-w-0">
              <ArtifactCard artifact={artifact} />
            </li>
          ))}
          {calls.map((call) => {
            const takes = snapshot?.recordings.filter((take) => take.callId === call.id).length;
            const where =
              takes === undefined || takes === 0
                ? snapshot !== null && call.recorded === true
                  ? " · recorded on another PC"
                  : ""
                : ` · ${takes} ${takes === 1 ? "take" : "takes"}`;
            return (
              <li key={call.id} className="min-w-0">
                <button
                  type="button"
                  data-testid="call-artifact"
                  aria-label={`${call.title} actions`}
                  onClick={(event) => onCallMenu(event, call)}
                  onContextMenu={(event) => onCallMenu(event, call)}
                  style={{ height: ARTIFACT_HEIGHT }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md border border-line bg-bg px-1.5 text-left hover:bg-hover"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-hover text-muted">
                    <Phone className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-fg">{call.title}</span>
                    <span className="block truncate text-[10px] text-muted">
                      {START.format(new Date(call.start))}
                      {where}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div
        role="separator"
        aria-label="Resize artifacts"
        className="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none"
        onPointerDown={(event) => {
          const rect = box.current?.getBoundingClientRect();
          if (event.button !== 0 || rect === undefined) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          press.current = {
            x: event.clientX,
            y: event.clientY,
            width: rect.width / scale,
            height: rect.height / scale,
          };
        }}
        onPointerMove={(event) => {
          const start = press.current;
          if (start === null) return;
          setDrag({
            width: clamp(start.width + (event.clientX - start.x) / scale, MIN.width, MAX.width),
            height: clamp(start.height + (event.clientY - start.y) / scale, MIN.height, MAX.height),
          });
        }}
        onPointerUp={() => {
          press.current = null;
          if (drag !== null) void saveArtifactArea(registry, boardId, drag);
          setDrag(null);
        }}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
      />
    </section>
  );
}
