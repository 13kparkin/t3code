/** How long after its start a call still notifies, and its card says Starting now. */
const LATE_MS = 10 * 60_000;

interface Timed {
  readonly id: string;
  readonly start: string;
}

/** The start each call last notified for, by call id. */
export type Notified = Readonly<Record<string, string>>;

export const isStarting = (call: Timed, now: number) => {
  const start = Date.parse(call.start);
  return start <= now && now < start + LATE_MS;
};

/** The calls that start within the last 10 minutes and have not notified for that start. */
export const dueCalls = <C extends Timed>(
  calls: ReadonlyArray<C>,
  now: number,
  notified: Notified,
) => calls.filter((call) => isStarting(call, now) && notified[call.id] !== call.start);

/** The next start or end of a starting window after `now`, or null when none is left. */
export function nextWake(calls: ReadonlyArray<Timed>, now: number): number | null {
  const times = calls
    .flatMap((call) => [Date.parse(call.start), Date.parse(call.start) + LATE_MS])
    .filter((time) => time > now);
  return times.length === 0 ? null : Math.min(...times);
}

/** Adds the due calls and drops every call whose window has closed, so the record stays small. */
export const markNotified = (
  notified: Notified,
  due: ReadonlyArray<Timed>,
  now: number,
): Notified =>
  Object.fromEntries([
    ...Object.entries(notified).filter(([id, start]) => isStarting({ id, start }, now)),
    ...due.map((call) => [call.id, call.start] as const),
  ]);
