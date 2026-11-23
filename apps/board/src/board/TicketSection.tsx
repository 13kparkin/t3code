import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** An open section of a ticket's details: a header that collapses it, then its body. */
export function TicketSection({
  title,
  fill,
  onCollapse,
  children,
}: {
  title: string;
  fill: boolean;
  onCollapse: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col border-b border-line ${fill ? "min-h-0 flex-1" : "shrink-0"}`}
    >
      <button
        type="button"
        aria-expanded
        onClick={onCollapse}
        className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold text-muted uppercase hover:text-fg"
      >
        <ChevronDown className="size-3.5" aria-hidden />
        {title}
      </button>
      <div className={`px-3 pb-2 text-[12px] ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        {children}
      </div>
    </section>
  );
}
