import type { CallApp } from "../domain/board";
import { CALL_APPS } from "./recorder";

/** One transcribed segment, timed in ms from the call's first take. */
export interface Said {
  readonly who: "me" | "them";
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface TranscriptHeader {
  readonly title: string;
  readonly app: CallApp;
  readonly from: Date;
  readonly to: Date;
  /** False when the microphone track is silent throughout, as the recorder writes a blocked mic. */
  readonly meRecorded: boolean;
}

const ECHO_SHARE = 0.6;
const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Drops each Me line that overlaps Them in time and repeats at least 60 percent of its words. */
export function dropEcho(me: ReadonlyArray<Said>, them: ReadonlyArray<Said>): Said[] {
  return me.filter((line) => {
    const heard = new Set(
      them
        .filter((other) => other.start < line.end && line.start < other.end)
        .flatMap((other) => words(other.text)),
    );
    const own = words(line.text);
    return (
      own.length === 0 || own.filter((word) => heard.has(word)).length < ECHO_SHARE * own.length
    );
  });
}

const pad = (value: number) => String(value).padStart(2, "0");
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const day = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const stamp = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `[${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}]`;
};

/** The Markdown `transcript.md` holds, lines in time order, empty ones left out. */
export function renderTranscript(header: TranscriptHeader, said: ReadonlyArray<Said>): string {
  const app = CALL_APPS[header.app].title;
  const me = header.meRecorded ? "Me is this PC's microphone." : "Me was not recorded.";
  const lines = said
    .filter((line) => line.text.trim() !== "")
    .toSorted((a, b) => a.start - b.start)
    .map(
      (line) => `${stamp(line.start)} ${line.who === "me" ? "Me" : "Them"}: ${line.text.trim()}`,
    );
  return [
    `# ${header.title}`,
    `Recorded ${day(header.from)} ${clock(header.from)} to ${clock(header.to)} from ${app}. ${me} Them is ${app}'s audio.`,
    "",
    ...lines,
    "",
  ].join("\n");
}
