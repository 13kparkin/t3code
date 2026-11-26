import { type Recording, type TrackRange, WINDOW_SAMPLES } from "../domain/recording";
import { frameLevels, speechSegments } from "./speechSegments";
import { dropEcho, renderTranscript, type Said } from "./transcript";

const SAMPLE_RATE = 16_000;

/** The engine takes Float32 PCM. */
const toFloat32 = (samples: Int16Array) =>
  new Uint8Array(Float32Array.from(samples, (sample) => sample / 32768).buffer);

/** True while the call still has exactly the takes that were transcribed, so none would go untranscribed. */
export const sameTakes = (
  transcribed: ReadonlyArray<Pick<Recording, "startedAt">>,
  now: ReadonlyArray<Pick<Recording, "startedAt">>,
) =>
  now.length === transcribed.length &&
  transcribed.every((take) => now.some((other) => other.startedAt === take.startedAt));

/** Deletes the audio after the write. Any failure throws before the write, so the audio stays for a retry. */
export async function transcribeTakes(input: {
  /** The call's ended takes, in the order they started. */
  readonly takes: ReadonlyArray<Recording>;
  readonly read: (range: TrackRange) => Promise<ArrayBuffer | null>;
  readonly transcribe: (pcm: Uint8Array) => Promise<string>;
  readonly write: (markdown: string) => Promise<void>;
  readonly deleteAudio: () => Promise<boolean>;
  readonly progress: (done: number, total: number) => void;
}): Promise<void> {
  const first = input.takes[0];
  const endedAt = input.takes.at(-1)?.endedAt;
  if (first === undefined || endedAt == null) return;
  const read = async (range: TrackRange) => {
    const bytes = await input.read(range);
    if (bytes === null) throw new Error("The audio is no longer on this PC.");
    return new Int16Array(bytes);
  };

  const jobs: Array<{
    readonly who: Said["who"];
    readonly range: TrackRange;
    readonly at: number;
  }> = [];
  let meRecorded = false;
  for (const take of input.takes) {
    const offset = Date.parse(take.startedAt) - Date.parse(first.startedAt);
    for (const { who } of take.tracks) {
      const file = who === "me" ? "me.wav" : "them.wav";
      const whole: Omit<TrackRange, "from" | "to"> = {
        callId: take.callId,
        startedAt: take.startedAt,
        file,
      };
      const levels: Float32Array[] = [];
      for (let from = 0; ; from += WINDOW_SAMPLES) {
        const window = await read({ ...whole, from, to: from + WINDOW_SAMPLES });
        levels.push(frameLevels(window, SAMPLE_RATE));
        if (window.length < WINDOW_SAMPLES) break;
      }
      const joined = Float32Array.from(levels.flatMap((part) => [...part]));
      if (who === "me" && joined.some((level) => level > 0)) meRecorded = true;
      for (const span of speechSegments(joined, SAMPLE_RATE)) {
        jobs.push({
          who,
          range: { ...whole, from: span.start, to: span.end },
          at: offset + (span.start * 1000) / SAMPLE_RATE,
        });
      }
    }
  }

  const said: Said[] = [];
  input.progress(0, jobs.length);
  for (const job of jobs) {
    const text = await input.transcribe(toFloat32(await read(job.range)));
    const end = job.at + ((job.range.to - job.range.from) * 1000) / SAMPLE_RATE;
    said.push({ who: job.who, start: job.at, end, text });
    input.progress(said.length, jobs.length);
  }

  const byWho = (who: Said["who"]) => said.filter((line) => line.who === who);
  await input.write(
    renderTranscript(
      {
        title: first.title,
        app: first.app,
        from: new Date(first.startedAt),
        to: new Date(endedAt),
        meRecorded,
      },
      [...dropEcho(byWho("me"), byWho("them")), ...byWho("them")],
    ),
  );
  await input.deleteAudio();
}
