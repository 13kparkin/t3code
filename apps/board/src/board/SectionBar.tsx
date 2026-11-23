import { ChevronRight } from "lucide-react";

/** A collapsed section of a ticket's details, stacked at the bottom of the panel. Pressing it opens the section. */
export function SectionBar({ title, onExpand }: { title: string; onExpand: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-label={`Show ${title}`}
      onClick={onExpand}
      className="flex h-7 w-full items-center gap-1 border-t border-line px-2 text-[11px] font-semibold text-muted uppercase hover:bg-hover hover:text-fg"
    >
      <ChevronRight className="size-3.5" aria-hidden />
      {title}
    </button>
  );
}
