import type { CardStatus } from "./ticketStatus";

export function CardLine({
  tag,
  title,
  status,
  detail,
}: {
  tag: string | null;
  title: string;
  status: CardStatus | null;
  detail: string;
}) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${status?.tone ?? "border border-faint"}`}
        />
        {tag !== null && (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-fg">{tag}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{title}</span>
        {status !== null && <span className="shrink-0 text-[10px] text-muted">{status.word}</span>}
      </span>
      <span className="truncate pl-3.5 text-[11px] text-faint">{detail}</span>
    </>
  );
}
