import { createPortal } from "react-dom";

import { MenuList, type PopMenuItem } from "./MenuList";

/**
 * A menu at the pointer, for a right-click. Like T3 web's DOM fallback for its native menu
 * (apps/web/src/contextMenuFallback.ts), it takes focus, and Escape or focus leaving closes it.
 */
export function ContextMenu({
  at,
  label,
  items,
  onClose,
}: {
  at: { readonly x: number; readonly y: number };
  label: string;
  items: ReadonlyArray<PopMenuItem>;
  onClose: () => void;
}) {
  return createPortal(
    <div
      onBlur={(event) => {
        if (
          !(
            event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
          )
        )
          onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <MenuList
        label={label}
        items={items}
        onClose={onClose}
        autoFocus
        className="fixed"
        style={{ left: at.x, top: at.y }}
      />
    </div>,
    document.body,
  );
}
