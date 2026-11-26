/** A range of samples, `end` exclusive. */
interface Span {
  readonly start: number;
  readonly end: number;
}

const FRAME_MS = 20;
/** -50 dBFS, loose on purpose, since the engine's own voice filter drops the noise that gets past it. */
const SPEECH_RMS = 32768 * 10 ** (-50 / 20);
const CLOSE_GAP_MS = 800;
const MIN_RUN_MS = 300;
/** Well under the engine's 5-minute cap, and short enough to time each line. */
const MAX_RUN_MS = 30_000;
/** Parakeet returns nothing for a short word cut at its edges, such as a 0.38 s "Okay.". */
const PAD_MS = 250;

const frames = (ms: number) => ms / FRAME_MS;

/** The RMS of each 20 ms frame, the last one over what is left. */
export function frameLevels(samples: Int16Array, sampleRate: number): Float32Array {
  const size = (sampleRate * FRAME_MS) / 1000;
  const levels = new Float32Array(Math.ceil(samples.length / size));
  for (let frame = 0; frame < levels.length; frame += 1) {
    const end = Math.min(samples.length, (frame + 1) * size);
    let sum = 0;
    for (let index = frame * size; index < end; index += 1) sum += samples[index]! ** 2;
    levels[frame] = Math.sqrt(sum / (end - frame * size));
  }
  return levels;
}

/** Speech runs. Short gaps close, clicks drop, and a long run splits at a quiet frame. */
export function speechSegments(levels: Float32Array, sampleRate: number): Span[] {
  const runs: Array<{ start: number; end: number }> = [];
  for (let frame = 0; frame < levels.length; frame += 1) {
    if (levels[frame]! < SPEECH_RMS) continue;
    const last = runs.at(-1);
    if (last !== undefined && frame - last.end < frames(CLOSE_GAP_MS)) last.end = frame + 1;
    else runs.push({ start: frame, end: frame + 1 });
  }
  // Each run is padded at its two ends, so its pieces split 0.5 s short of the cap.
  const max = frames(MAX_RUN_MS - 2 * PAD_MS);
  const size = (sampleRate * FRAME_MS) / 1000;
  const pad = (sampleRate * PAD_MS) / 1000;
  const pieces: Span[] = [];
  for (const run of runs.filter(({ start, end }) => end - start >= frames(MIN_RUN_MS))) {
    const cuts = [run.start];
    for (let start = run.start; run.end - start > max; start = cuts.at(-1)!) {
      let cut = start + Math.floor(max / 2);
      // The latest of equal frames, so an even run splits as close to the cap as it can.
      for (let frame = cut; frame < start + max; frame += 1) {
        if (levels[frame]! <= levels[cut]!) cut = frame;
      }
      cuts.push(cut);
    }
    cuts.push(run.end);
    for (let index = 1; index < cuts.length; index += 1) {
      pieces.push({
        start: Math.max(0, cuts[index - 1]! * size - (index === 1 ? pad : 0)),
        end: Math.min(
          levels.length * size,
          cuts[index]! * size + (index === cuts.length - 1 ? pad : 0),
        ),
      });
    }
  }
  return pieces;
}
