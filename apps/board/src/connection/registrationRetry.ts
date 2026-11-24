import * as Schedule from "effect/Schedule";

/** Asks again with no end, waiting 1 s and doubling up to 30 s, so an engine that starts late is still found. */
export const REGISTRATION_RETRY = Schedule.min([
  Schedule.exponential("1 second"),
  Schedule.spaced("30 seconds"),
]);
