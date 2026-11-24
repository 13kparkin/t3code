import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function TicketSection({
  title,
  onCollapse,
  children,
}: {
  title: string;
  onCollapse: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex shrink-0 flex-col border-b border-line">
      <button
        type="button"
        aria-expanded
        onClick={onCollapse}
        className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold text-muted uppercase hover:text-fg"
      >
        <ChevronDown className="size-3.5" aria-hidden />
        {title}
      </button>
      <div className="px-3 pb-2 text-[12px]">{children}</div>
    </section>
  );
}
