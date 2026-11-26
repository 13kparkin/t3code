import { describe, expect, it } from "vite-plus/test";

import { frameLevels, speechSegments } from "./speechSegments";

const RATE = 16_000;

/** A square wave of `amplitude` over `[from, to)` seconds, silence elsewhere. */
function track(seconds: number, tones: ReadonlyArray<readonly [number, number, number]>) {
  const samples = new Int16Array(seconds * RATE);
  for (const [from, to, amplitude] of tones) {
    for (let index = Math.round(from * RATE); index < Math.round(to * RATE); index += 1) {
      samples[index] = index % 2 === 0 ? amplitude : -amplitude;
    }
  }
  return samples;
}

const segments = (samples: Int16Array) => speechSegments(frameLevels(samples, RATE), RATE);

describe("speechSegments", () => {
  it("closes short gaps, drops clicks, and splits a long run at its quietest frame", () => {
    const samples = track(50, [
      [1, 2, 3000],
      // 500 ms of silence closes, so 1 s to 3 s is one run.
      [2.5, 3, 3000],
      // 200 ms is under the 300 ms floor.
      [5, 5.2, 3000],
      // 40 s of speech with a quieter 20 ms at 28 s, inside the last half of the first 30 s.
      [8, 28, 3000],
      [28, 28.02, 200],
      [28.02, 48, 3000],
    ]);
    expect(segments(samples)).toEqual([
      { start: 16_000, end: 48_000 },
      { start: 128_000, end: 448_000 },
      { start: 448_000, end: 768_000 },
    ]);
  });

  it("keeps every piece of an even run within 30 seconds", () => {
    expect(segments(track(70, [[0, 70, 3000]]))).toEqual([
      { start: 0, end: 479_680 },
      { start: 479_680, end: 959_360 },
      { start: 959_360, end: 1_120_000 },
    ]);
  });

  it("finds nothing in silence or noise under the floor", () => {
    expect(segments(track(5, [[0, 5, 50]]))).toEqual([]);
  });
});
