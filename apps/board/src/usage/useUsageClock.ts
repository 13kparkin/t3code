import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

// Reset times shown in minutes and hours change slowly, so the clock moves in whole ticks.
function subscribeToClock(onTick: () => void) {
  const timer = setInterval(onTick, TICK_MS);
  return () => clearInterval(timer);
}
const readClock = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

/** The time usage resets count down from, in 30 second ticks. */
export const useUsageClock = () => useSyncExternalStore(subscribeToClock, readClock);
