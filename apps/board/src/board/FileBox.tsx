import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { type PointerEvent, type ReactNode, useContext, useRef, useState } from "react";

import { changeFileBox, fileBoxesAtom } from "../state/boardUi";
import type { FileBox as Box } from "../store/localState";
import { ARTIFACT_GAP, ARTIFACT_HEIGHT, LANE_HEAD, LANE_MAX_HEIGHT, LANE_WIDTH } from "./layout";
import { useViewScale } from "./Viewport";

const MIN = { width: 216, height: 120 };
const MAX = { width: 4 * LANE_WIDTH, height: LANE_MAX_HEIGHT };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/**
 * One box of file cards on the canvas: the Artifacts area, or a files section opened from it. The
 * header drags it, the corner resizes it, and the grid's columns follow its width. Its place and
 * size are kept per board under `boxKey`. In the top row (`place: "row"`) it takes the orchestrator
 * card's height until resized. A free box sits at the same origin, offset by its saved place.
 */
export function FileBox({
  boardId,
  boxKey,
  place,
  fallback,
  title,
  actions,
  children,
}: {
  boardId: string;
  boxKey: string;
  place: "row" | "free";
  fallback: Box;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const registry = useContext(RegistryContext);
  const boxes = useAtomValue(fileBoxesAtom)[boardId] ?? {};
  const saved = boxes[boxKey];
  const scale = useViewScale();
  const ref = useRef<HTMLElement>(null);
  const press = useRef<{ mode: "move" | "size"; x: number; y: number; box: Box } | null>(null);
  const [live, setLive] = useState<Box | null>(null);
  const box = live ?? saved ?? fallback;
  const start = (mode: "move" | "size") => (event: PointerEvent<HTMLElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (event.button !== 0 || rect === undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    // Only a resize fixes the size, so a moved area keeps following the card's height.
    const sized = { ...box, width: rect.width / scale, height: rect.height / scale };
    press.current = {
      mode,
      x: event.clientX,
      y: event.clientY,
      box: mode === "size" ? sized : box,
    };
  };
  const drag = (event: PointerEvent<HTMLElement>) => {
    const from = press.current;
    if (from === null) return;
    const dx = (event.clientX - from.x) / scale;
    const dy = (event.clientY - from.y) / scale;
    setLive(
      from.mode === "move"
        ? { ...from.box, x: Math.round(from.box.x + dx), y: Math.round(from.box.y + dy) }
        : {
            ...from.box,
            width: clamp((from.box.width ?? LANE_WIDTH) + dx, MIN.width, MAX.width),
            height: clamp((from.box.height ?? MIN.height) + dy, MIN.height, MAX.height),
          },
    );
  };
  const end = () => {
    press.current = null;
    if (live !== null) {
      void changeFileBox(registry, boardId, boxKey, fallback, (now) => ({
        ...live,
        z: now.z ?? 0,
      }));
    }
    setLive(null);
  };
  const handlers = { onPointerMove: drag, onPointerUp: end, onPointerCancel: end };
  const z = saved?.z ?? 0;
  const raise = () => {
    const others = Object.entries(boxes).flatMap(([key, other]) =>
      key === boxKey ? [] : [other.z ?? 0],
    );
    if (!others.some((other) => other >= z)) return;
    const top = Math.max(...others) + 1;
    void changeFileBox(registry, boardId, boxKey, fallback, (now) => ({ ...now, z: top }));
  };
  return (
    <section
      ref={ref}
      aria-label={boxKey === "artifacts" ? "Artifacts" : `Files ${boxKey}`}
      data-testid="file-box"
      data-box={boxKey}
      onPointerDown={(event) => {
        event.stopPropagation();
        raise();
      }}
      className={`rounded-xl border border-dashed border-line bg-bg ${place === "row" ? "relative shrink-0 self-stretch" : "absolute top-0 left-0"}`}
      style={{
        // Above the lanes, which have no z-index, and in the order the user last pressed the boxes.
        zIndex: 5 + z,
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.width ?? LANE_WIDTH,
        height: box.height,
      }}
    >
      {/* Out of flow, so the card's height, not this grid, sets the row's height. */}
      <div className="absolute inset-0 flex flex-col">
        <header
          tabIndex={-1}
          className="flex shrink-0 cursor-grab touch-none items-center gap-1.5 px-3 select-none"
          style={{ height: LANE_HEAD }}
          onPointerDown={start("move")}
          {...handlers}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">{title}</div>
          {actions}
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
          {children}
        </ul>
      </div>
      <div
        role="separator"
        aria-label="Resize"
        className="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none"
        onPointerDown={start("size")}
        {...handlers}
      />
    </section>
  );
}
