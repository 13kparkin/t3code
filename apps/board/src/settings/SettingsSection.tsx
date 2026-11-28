import type { ReactNode } from "react";

import { DOC_HEADING } from "../ui/docStyles";

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
    <section className="flex flex-col gap-3">
      <h2 className={DOC_HEADING}>{title}</h2>
      <div className={`divide-y divide-line border-y border-line ${clip ? "overflow-hidden" : ""}`}>
        {children}
      </div>
      {note && <p className="text-xs text-faint">{note}</p>}
    </section>
  );
}
