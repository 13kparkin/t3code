/** How long after its start a call stays in the Calls group. */
const LATE_MS = 10 * 60_000;
/** A take runs at most 4 hours and is swept 7 days after it ends. */
const TAKE_LIFE_MS = (4 + 7 * 24) * 60 * 60_000;

interface Timed {
  readonly id: string;
  readonly start: string;
  readonly recordedAt?: string;
}

const isStarting = (call: Timed, now: number) => {
  const start = Date.parse(call.start);
  return start <= now && now < start + LATE_MS;
};

/**
 * Where each call goes: the Calls group (the recording and recent calls, and an old board's next call, then `later`),
 * Artifacts for a finished call recorded on any PC while a take can still exist, or removal.
 * `takes` maps each call with takes on this PC to its first take's start, and is null while
 * unknown, which keeps every finished call. `mark` is the calls `board.json` should mark, with that start.
 */
export function splitCalls<C extends Timed>(
  calls: ReadonlyArray<C>,
  now: number,
  recording: string | null,
  takes: ReadonlyMap<string, string> | null,
) {
  const sorted = calls.toSorted((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const next = sorted.find((call) => Date.parse(call.start) > now);
  const current = (call: C) => call === next || call.id === recording || isStarting(call, now);
  const past = sorted.filter((call) => !current(call) && Date.parse(call.start) <= now);
  const marked = (call: C) =>
    call.recordedAt !== undefined && now < Date.parse(call.recordedAt) + TAKE_LIFE_MS;
  return {
    shown: sorted.filter(current),
    later: sorted.filter((call) => !current(call) && Date.parse(call.start) > now),
    finished: past.filter((call) => marked(call) || takes?.has(call.id) !== false),
    stale: past.filter((call) => !marked(call) && takes?.has(call.id) === false),
    mark: sorted.flatMap((call) => {
      const recordedAt = takes?.get(call.id);
      return call.recordedAt === undefined && recordedAt !== undefined
        ? [{ ...call, recordedAt }]
        : [];
    }),
  };
}
