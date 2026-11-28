export function SectionHeading({ name, note }: { name: string; note: string }) {
  return (
    <>
      <span className="truncate px-2 text-[11px] leading-5 font-semibold text-muted">{name}</span>
      <span className="shrink-0 text-[11px] text-faint">{note}</span>
    </>
  );
}
