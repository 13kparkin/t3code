import type { ReactNode } from "react";

export function SettingsSection({
  title,
  note,
  clip = true,
  children,
}: {
  title: string;
  note?: string | undefined;
  clip?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-1 text-[13px] font-medium text-muted">{title}</h2>
      <div
        className={`divide-y divide-line rounded-lg border border-line bg-panel ${clip ? "overflow-hidden" : ""}`}
      >
        {children}
      </div>
      {note && <p className="px-1 text-xs text-faint">{note}</p>}
    </section>
  );
}
