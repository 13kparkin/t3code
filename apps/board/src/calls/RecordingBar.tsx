import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import type { RecorderState } from "../connection/engineState";
import { secondAtom, stopRecording } from "../state/recorder";
import { CONSENT_LINE, elapsed } from "./recorder";

/**
 * The bar every board shows while a call records. Mount it only then, because its timer ticks once a second
 * for as long as it is mounted. The dot is static.
 */
export function RecordingBar({
  state,
}: {
  state: Extract<RecorderState, { status: "recording" }>;
}) {
  const now = useAtomValue(secondAtom);
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="status"
      aria-label="Recording a call"
      className="absolute top-3 left-1/2 z-30 flex max-w-[92%] -translate-x-1/2 items-center gap-2.5 rounded-full border border-line bg-panel py-1 pr-1.5 pl-3 shadow-panel"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-red-500" />
      <span className="min-w-0 truncate font-semibold">{state.title}</span>
      <span className="text-muted tabular-nums">{elapsed(now - Date.parse(state.startedAt))}</span>
      {state.micMissing && (
        <span className="text-amber-300">Microphone off, recording the call only</span>
      )}
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(CONSENT_LINE).then(() => setCopied(true))}
        className="rounded-full px-2 py-0.5 text-muted hover:bg-hover hover:text-fg"
      >
        {copied ? "Copied" : "Copy consent line"}
      </button>
      <button
        type="button"
        onClick={stopRecording}
        className="rounded-full bg-fg px-2.5 py-0.5 font-medium text-bg"
      >
        Stop
      </button>
    </div>
  );
}
