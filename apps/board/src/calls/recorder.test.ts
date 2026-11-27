import { describe, expect, it } from "vite-plus/test";

import type { Recording } from "../domain/recording";

import { callAudio, callsToTranscribe, elapsed } from "./recorder";

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

describe("which calls the board transcribes by itself", () => {
  const recording = take({ startedAt: "2026-11-25T10:30:00.000Z", endedAt: null, endReason: null });
  const missing = { status: "failed", message: "Install it", missingModel: true } as const;
  it.each([
    ["a stopped take and no job", [take({})], {}, false, ["call-1"]],
    ["no take on this PC", [], {}, false, []],
    ["the take still recording", [recording], {}, false, []],
    ["an ended take and a later one still recording", [take({}), recording], {}, false, []],
    [
      "a run already going",
      [take({})],
      { "call-1": { status: "running", done: 0, total: 0 } },
      false,
      [],
    ],
    ["a transcript just written", [take({})], { "call-1": { status: "written" } }, false, []],
    [
      "a failure that is not the model",
      [take({})],
      { "call-1": { status: "failed", message: "Busy", missingModel: false } },
      true,
      [],
    ],
    ["a missing model, still missing", [take({})], { "call-1": missing }, false, []],
    ["a missing model, now installed", [take({})], { "call-1": missing }, true, ["call-1"]],
  ] as const)("Given %s", (_name, recordings, jobs, installed, ids) => {
    expect(
      callsToTranscribe([{ id: "call-1" }], recordings, jobs, installed).map((call) => call.id),
    ).toEqual(ids);
  });
});

describe("the recording bar's timer", () => {
  it.each([
    [61_000, "1:01"],
    [3_600_000, "1:00:00"],
  ])("Given %i ms, then it reads %s", (ms, text) => {
    expect(elapsed(ms)).toBe(text);
  });
});
