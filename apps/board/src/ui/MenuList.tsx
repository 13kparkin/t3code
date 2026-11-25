import type { CSSProperties } from "react";

export interface PopMenuItem {
  readonly label: string;
  /** A dim note at the item's right edge, such as why it is off. */
  readonly hint?: string | undefined;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

/** The items of a menu. A pick closes the menu before it runs. */
export function MenuList({
  id,
  label,
  items,
  onClose,
  className,
  style,
  autoFocus = false,
}: {
  id?: string;
  label: string;
  items: ReadonlyArray<PopMenuItem>;
  onClose: () => void;
  className: string;
  style?: CSSProperties;
  autoFocus?: boolean;
}) {
  return (
    <div
      id={id}
      role="menu"
      aria-label={label}
      style={style}
      className={`z-30 flex w-max min-w-52 flex-col rounded-lg border border-line bg-panel p-1 shadow-panel ${className}`}
    >
      {items.map((item, at) => (
        <button
          key={item.label}
          ref={autoFocus && at === 0 ? (node) => node?.focus() : undefined}
          type="button"
          role="menuitem"
          disabled={item.disabled === true}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className="flex items-center justify-between gap-6 rounded-md px-2 py-1.5 text-left text-[12px] whitespace-nowrap enabled:hover:bg-hover enabled:focus-visible:bg-hover disabled:text-faint"
        >
          {item.label}
          {item.hint !== undefined && <span className="text-[11px] text-faint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
