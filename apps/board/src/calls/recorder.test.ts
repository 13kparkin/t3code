import { describe, expect, it } from "vite-plus/test";

import type { Recording } from "../connection/engineState";

import { callAudio, elapsed } from "./recorder";

const take = (fields: Partial<Recording>): Recording => ({
  callId: "call-1",
  boardId: "board-1",
  title: "Design sync",
  app: "chrome",
  exe: "chrome.exe",
  targetPid: 1200,
  startedAt: "2026-11-25T10:00:00.000Z",
  endedAt: "2026-11-25T10:20:00.000Z",
  endReason: "stopped",
  error: null,
  tracks: [],
  deleteAfter: "2026-12-02T10:20:00.000Z",
  ...fields,
});

describe("what a call card says about its audio", () => {
  it.each([
    ["no recording", [], null],
    ["a take still recording", [take({ endedAt: null, endReason: null })], null],
    ["another call's take", [take({ callId: "call-2" })], null],
    ["a stopped take", [take({})], { minutes: 20, note: null }],
    [
      "two takes, the newest ending with the call",
      [
        take({
          startedAt: "2026-11-25T10:30:00.000Z",
          endedAt: "2026-11-25T10:40:00.000Z",
          endReason: "target_exited",
        }),
        take({}),
      ],
      { minutes: 30, note: "Call ended" },
    ],
    [
      "a take recovered after the board quit",
      [take({ endReason: "app_quit" })],
      { minutes: 20, note: "Recovered after the board closed" },
    ],
    [
      "a take that hit an error",
      [take({ endReason: "error", error: "The disk is full" })],
      { minutes: 20, note: "The disk is full" },
    ],
  ] as const)("Given %s, then it shows %j", (_name, recordings, shown) => {
    expect(callAudio(recordings, "call-1")).toEqual(shown);
  });
});

describe("the recording bar's timer", () => {
  it.each([
    [0, "0:00"],
    [59_999, "0:59"],
    [61_000, "1:01"],
    [3_600_000, "1:00:00"],
    [14_400_000, "4:00:00"],
  ])("Given %i ms, then it reads %s", (ms, text) => {
    expect(elapsed(ms)).toBe(text);
  });
});
