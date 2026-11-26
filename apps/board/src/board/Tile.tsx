import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

import { ARTIFACT_HEIGHT } from "./layout";

/** A card for something that is not a board file: a folder, a call, or a file of a take. */
export function Tile({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: ARTIFACT_HEIGHT }}
      className="flex w-full min-w-0 items-center gap-2 rounded-md border border-line bg-bg px-1.5 text-left hover:bg-hover"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded bg-hover text-muted">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-fg">{title}</span>
        <span className="block truncate text-[10px] text-muted">{hint}</span>
      </span>
    </button>
  );
}
