import { X } from "lucide-react";

import type { Addition } from "../domain/additions";
import { Tooltip } from "../ui/Tooltip";

export function RemoveAddition({ item, onRemove }: { item: Addition; onRemove: () => void }) {
  return (
    <Tooltip text="Remove from the board" side="bottom" align="end">
      <button
        type="button"
        aria-label={`Remove ${item.title}`}
        // A press here is a click, not the start of a pan.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
        className="grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
      >
        <X className="size-3" aria-hidden />
      </button>
    </Tooltip>
  );
}
