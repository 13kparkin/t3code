import { useState } from "react";
import { createPortal } from "react-dom";

import { CONSENT_LINE } from "./recorder";

/** Portaled out of the panned canvas. */
export function ConsentNotice({
  onAccept,
  onClose,
}: {
  onAccept: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return createPortal(
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-black/50"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Before you record"
        className="flex w-[440px] max-w-[92vw] flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-panel"
      >
        <h2 className="text-[15px] font-semibold">Before you record</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
          <li>Some places require everyone on a call to agree before it is recorded.</li>
          <li>Nothing joins the call, so nobody else is told. Ask them first.</li>
          <li>The audio stays on this PC for 7 days.</li>
          <li>
            The transcript goes to the board folder on the engine, where the project's agents can
            read it.
          </li>
          <li>The transcript text goes to the AI provider of the agent that writes the notes.</li>
          <li>A browser recording takes every tab in that browser.</li>
          <li>Use a headset, so your microphone does not pick up the call.</li>
        </ul>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(CONSENT_LINE).then(() => setCopied(true))
            }
            className="rounded-md border border-line px-2.5 py-1 text-fg hover:bg-hover"
          >
            {copied ? "Copied" : "Copy consent line"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onAccept}
            className="rounded-md bg-fg px-2.5 py-1 font-medium text-bg"
          >
            Accept and record
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
