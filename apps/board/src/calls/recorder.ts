import type { Recording } from "../connection/engineState";

export const CONSENT_LINE = "I'm recording this call to take notes. Is everyone OK with that?";

const END_NOTES = {
  stopped: null,
  target_exited: "Call ended",
  max_duration: "Stopped at 4 hours",
  error: "Recorder error",
  crashed: "Recorder crashed",
  app_quit: "Recovered after the board closed",
} as const satisfies Record<NonNullable<Recording["endReason"]>, string | null>;

/** What a call card says about the audio on this PC, or null when it has none. */
export function callAudio(
  recordings: ReadonlyArray<Recording>,
  callId: string,
): { readonly minutes: number; readonly note: string | null } | null {
  const ended = recordings
    .filter((recording) => recording.callId === callId && recording.endedAt !== null)
    .toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const last = ended.at(-1);
  if (last === undefined) return null;
  const ms = ended.reduce(
    (total, recording) =>
      total +
      Date.parse(recording.endedAt ?? recording.startedAt) -
      Date.parse(recording.startedAt),
    0,
  );
  const reason = last.endReason === null ? null : END_NOTES[last.endReason];
  return {
    minutes: Math.max(1, Math.round(ms / 60_000)),
    note: last.endReason === "error" && last.error !== null ? last.error : reason,
  };
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const [h, m, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
