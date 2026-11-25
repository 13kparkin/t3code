import { type ReactNode, useId, useState } from "react";

import { MenuList, type PopMenuItem } from "./MenuList";

/** A button that opens a menu of actions, shaped like Orca's menus: label left, hint right. Escape and a click away close it. */
export function PopMenu({
  label,
  trigger,
  items,
  align = "end",
  triggerClass,
}: {
  label: string;
  trigger: ReactNode;
  items: ReadonlyArray<PopMenuItem>;
  align?: "start" | "end";
  triggerClass: string;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (
          open &&
          !(
            event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
          )
        ) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        className={triggerClass}
      >
        {trigger}
      </button>
      {open && (
        <MenuList
          id={menuId}
          label={label}
          items={items}
          onClose={() => setOpen(false)}
          className={`absolute top-full mt-1 ${align === "end" ? "right-0" : "left-0"}`}
        />
      )}
    </div>
  );
}
