import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RecorderSnapshot } from "../src/connection/engineState";
import type { Recording } from "../src/domain/recording";

import * as Option from "effect/Option";

import { createRecorder, decodeCallId, decodeRequest, type Helper } from "./recorder";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) NodeFS.rmSync(folder, { recursive: true, force: true });
});

const CHROME_LIST = JSON.stringify({
  protocol: 1,
  build: 22631,
  supported: true,
  processes: [
    { exe: "chrome.exe", pid: 1200, title: "Design sync - Google Meet" },
    { exe: "Signal.exe", pid: 1500, title: "Private chat with Sam" },
  ],
});

const REQUEST = {
  callId: "call-1",
  boardId: "board-1",
  title: "Design sync",
  app: "chrome",
} as const;
const STARTED_AT = "2026-11-25T10:00:00.000Z";

type HelperLine = Readonly<Record<string, string | number | null>>;

interface FakeChild {
  readonly args: ReadonlyArray<string>;
  readonly sent: Array<"stop" | "end">;
  readonly print: (event: HelperLine) => void;
  readonly close: () => Promise<void>;
}

function setup(
  options: { list?: string; repaired?: ReadonlyArray<string>; consented?: boolean } = {},
) {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-recorder-"));
  folders.push(root);
  const runs: Array<ReadonlyArray<string>> = [];
  const children: FakeChild[] = [];
  const published: RecorderSnapshot[] = [];
  const nudges: string[] = [];
  const repaired = [...(options.repaired ?? [])];
  let clock = Date.parse(STARTED_AT);
  const helper: Helper = {
    run: async (args) => {
      runs.push(args);
      if (args[0] === "list") return options.list ?? CHROME_LIST;
      return repaired.shift() ?? `{"event":"repaired","seconds":0}`;
    },
    spawn: (args, onLine, onClose) => {
      const child: FakeChild = {
        args,
        sent: [],
        print: (event) => onLine(JSON.stringify(event)),
        close: onClose,
      };
      children.push(child);
      return { stop: () => child.sent.push("stop"), end: () => child.sent.push("end") };
    },
  };
  const recorder = createRecorder({
    root,
    helper,
    now: () => new Date(clock),
    consented: () => options.consented ?? true,
    publish: (snapshot) => published.push(snapshot),
    nudge: (title) => nudges.push(title),
  });
  return {
    root,
    runs,
    children,
    nudges,
    recorder,
    statuses: () => published.map(({ state }) => state.status),
    lastState: () => published.at(-1)?.state,
    advance: (ms: number) => {
      clock += ms;
    },
    file: (...parts: string[]) =>
      JSON.parse(NodeFS.readFileSync(NodePath.join(root, ...parts), "utf8")),
  };
}

const started = { event: "started", protocol: 1, sampleRate: 16000, exe: "chrome.exe" };

async function startRecording(rig: ReturnType<typeof setup>) {
  await rig.recorder.start(REQUEST);
  const child = rig.children.at(-1);
  if (child === undefined) throw new Error("the helper did not start");
  child.print(started);
  return child;
}

const recordingFile = (fields: Partial<Recording>) => ({
  callId: "call-1",
  boardId: "board-1",
  title: "Design sync",
  app: "chrome",
  exe: "chrome.exe",
  targetPid: 1200,
  startedAt: STARTED_AT,
  tracks: [
    { who: "me", file: "me.wav" },
    { who: "them", file: "them.wav" },
  ],
  error: null,
  ...fields,
});

describe("recording a call", () => {
  it("Given a running Chrome, when Record then Stop, then recording.json moves deleteAfter from the start to the end", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    const dir = NodePath.join(rig.root, "call-1", "1");
    expect(child.args).toEqual([
      "record",
      "--pid",
      "1200",
      "--them",
      NodePath.join(dir, "them.wav"),
      "--me",
      NodePath.join(dir, "me.wav"),
    ]);
    expect(rig.file("call-1", "1", "recording.json")).toEqual(
      recordingFile({
        endedAt: null,
        endReason: null,
        deleteAfter: "2026-12-02T10:00:00.000Z",
      }),
    );
    rig.recorder.stop();
    expect(child.sent).toEqual(["stop"]);
    child.print({ event: "stopped", reason: "stop", seconds: 90 });
    await child.close();
    expect(rig.statuses()).toEqual(["starting", "recording", "idle"]);
    expect(rig.lastState()).toEqual({ status: "idle", failed: null });
    expect(rig.file("call-1", "1", "recording.json")).toEqual(
      recordingFile({
        endedAt: "2026-11-25T10:01:30.000Z",
        endReason: "stopped",
        deleteAfter: "2026-12-02T10:01:30.000Z",
      }),
    );
  });

  it.each([
    ["the call app quits", "target_exited", "target_exited"],
    ["the board quits", "stdin_closed", "app_quit"],
  ])(
    "Given a recording, when %s, then the helper's %s ends the take as %s",
    async (_when, reason, endReason) => {
      const rig = setup();
      const child = await startRecording(rig);
      child.print({ event: "stopped", reason, seconds: 600 });
      await child.close();
      expect(rig.statuses()).toEqual(["starting", "recording", "idle"]);
      expect(rig.file("call-1", "1", "recording.json")).toMatchObject({
        endReason,
        endedAt: "2026-11-25T10:10:00.000Z",
      });
    },
  );

  it("Given a recording, when the helper exits without stopped, then both tracks are repaired before it is marked crashed", async () => {
    const rig = setup({
      repaired: ['{"event":"repaired","seconds":40.5}', '{"event":"repaired","seconds":42}'],
    });
    const child = await startRecording(rig);
    await child.close();
    const dir = NodePath.join(rig.root, "call-1", "1");
    expect(rig.runs.slice(1)).toEqual([
      ["repair", NodePath.join(dir, "me.wav")],
      ["repair", NodePath.join(dir, "them.wav")],
    ]);
    expect(rig.statuses()).toEqual(["starting", "recording", "idle"]);
    expect(rig.file("call-1", "1", "recording.json")).toMatchObject({
      endReason: "crashed",
      endedAt: "2026-11-25T10:00:42.000Z",
      deleteAfter: "2026-12-02T10:00:42.000Z",
    });
  });

  it("Given a helper error mid-call, then the recording keeps its audio and the error", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    child.print({ event: "error", code: "disk_full", message: "The disk is full" });
    child.print({ event: "stopped", reason: "error", seconds: 30 });
    await child.close();
    expect(rig.file("call-1", "1", "recording.json")).toMatchObject({
      endReason: "error",
      error: "The disk is full",
    });
  });

  it("Given a take, when Record is pressed again, then nothing starts until it ends, and the next take gets new paths", async () => {
    const rig = setup();
    const first = await startRecording(rig);
    await rig.recorder.start(REQUEST);
    expect(rig.children).toHaveLength(1);
    first.print({ event: "stopped", reason: "stop", seconds: 5 });
    await first.close();
    await startRecording(rig);
    expect(rig.children[1]?.args[4]).toBe(NodePath.join(rig.root, "call-1", "2", "them.wav"));
    expect(rig.file("call-1", "1", "recording.json")).toMatchObject({ endReason: "stopped" });
  });

  it.each([
    ["Chrome is not running", { processes: [] }, "Chrome is not running."],
    [
      "Windows is too old",
      { supported: false },
      "This Windows version is too old to record one app's audio.",
    ],
    [
      "the helper speaks another protocol",
      { protocol: 2 },
      "The recorder could not start. Reinstall the board.",
    ],
  ])("Given %s, then no helper starts and the card says why", async (_given, change, message) => {
    const rig = setup({ list: JSON.stringify({ ...JSON.parse(CHROME_LIST), ...change }) });
    await rig.recorder.start(REQUEST);
    expect(rig.children).toEqual([]);
    expect(rig.lastState()).toEqual({ status: "idle", failed: { callId: "call-1", message } });
    expect(NodeFS.readdirSync(rig.root)).toEqual([]);
  });

  it("Given the helper has not started yet, when Stop is pressed, then the helper is told to stop", async () => {
    const rig = setup();
    await rig.recorder.start(REQUEST);
    rig.recorder.stop();
    expect(rig.children[0]?.sent).toEqual(["stop"]);
  });

  it("Given a recording, when the microphone drops and returns, then the bar follows it", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    child.print({ event: "warning", code: "mic_reopened", message: "back" });
    expect(rig.statuses()).toEqual(["starting", "recording"]);
    child.print({ event: "warning", code: "mic_unavailable", message: "gone" });
    expect(rig.lastState()).toMatchObject({ status: "recording", micMissing: true });
    child.print({ event: "warning", code: "mic_reopened", message: "back" });
    expect(rig.lastState()).toMatchObject({ status: "recording", micMissing: false });
  });

  it("Given the helper started on another app, then it stops, keeps nothing, and says why", async () => {
    const rig = setup();
    await rig.recorder.start(REQUEST);
    const child = rig.children[0];
    child?.print({ ...started, exe: "msedge.exe" });
    expect(child?.sent).toEqual(["stop"]);
    child?.print({ event: "stopped", reason: "stop", seconds: 1 });
    await child?.close();
    expect(rig.statuses()).toEqual(["starting", "idle"]);
    expect(rig.lastState()).toEqual({
      status: "idle",
      failed: { callId: "call-1", message: "The recorder found msedge.exe, not Chrome." },
    });
    expect(NodeFS.readdirSync(rig.root)).toEqual([]);
  });

  it("Given the helper refuses the target, then the card says the app is not running", async () => {
    const rig = setup();
    await rig.recorder.start(REQUEST);
    const child = rig.children[0];
    child?.print({ event: "error", code: "target_not_found", message: "No running process" });
    await child?.close();
    expect(rig.lastState()).toEqual({
      status: "idle",
      failed: { callId: "call-1", message: "Chrome is not running." },
    });
  });

  it("Given no saved consent, then nothing runs and the window still hears back", async () => {
    const rig = setup({ consented: false });
    await rig.recorder.start(REQUEST);
    expect([rig.runs, rig.statuses()]).toEqual([[], ["idle"]]);
  });

  it.each([
    ["a".repeat(64), true],
    ["../escape", false],
    ["", false],
    ["a".repeat(65), false],
    ["call 1", false],
    ["call_1", false],
  ])("Given the call id %j, then Record and Delete audio parse it: %s", (callId, parses) => {
    expect(Option.isSome(decodeRequest({ ...REQUEST, callId }))).toBe(parses);
    expect(Option.isSome(decodeCallId(callId))).toBe(parses);
  });
});

describe("silence and the 4-hour cap", () => {
  it("Given 10 minutes of silence from the call, then one nudge per silent stretch shows and recording continues", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    const level = (t: number, them: number) => child.print({ event: "level", t, me: -40, them });
    level(1, -20);
    level(300, -100);
    level(600, -100);
    expect(rig.nudges).toEqual([]);
    level(601, -100);
    level(700, -100);
    expect(rig.nudges).toEqual(["Design sync"]);
    level(705, -20);
    level(1304, -100);
    expect(rig.nudges).toEqual(["Design sync"]);
    level(1305, -100);
    expect(rig.nudges).toEqual(["Design sync", "Design sync"]);
    expect(child.sent).toEqual([]);
  });

  it("Given 4 hours of recording, then main stops it and marks max_duration", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    child.print({ event: "level", t: 14_399, me: -40, them: -20 });
    expect(child.sent).toEqual([]);
    child.print({ event: "level", t: 14_400, me: -40, them: -20 });
    child.print({ event: "level", t: 14_401, me: -40, them: -20 });
    expect(child.sent).toEqual(["stop"]);
    child.print({ event: "stopped", reason: "stop", seconds: 14_400.4 });
    await child.close();
    expect(rig.file("call-1", "1", "recording.json")).toMatchObject({
      endReason: "max_duration",
    });
  });
});

describe("recovery and retention", () => {
  const writeTake = (root: string, callId: string, take: string, fields: Partial<Recording>) => {
    const dir = NodePath.join(root, callId, take);
    NodeFS.mkdirSync(dir, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(dir, "recording.json"),
      JSON.stringify(recordingFile({ callId, ...fields })),
    );
  };

  it("Given a take left open when the board quit, when the board opens, then both tracks are repaired and it ends with app_quit", async () => {
    const rig = setup({
      repaired: ['{"event":"repaired","seconds":120}', '{"event":"error","code":"invalid_wav"}'],
    });
    writeTake(rig.root, "call-1", "1", {
      endedAt: null,
      endReason: null,
      deleteAfter: "2026-12-02T10:00:00.000Z",
    });
    writeTake(rig.root, "call-0", "1", {
      endedAt: STARTED_AT,
      endReason: "stopped",
      deleteAfter: "2026-12-02T10:00:00.000Z",
    });
    await rig.recorder.recover();
    expect(rig.statuses()).toEqual(["idle"]);
    const dir = NodePath.join(rig.root, "call-1", "1");
    expect(rig.runs).toEqual([
      ["repair", NodePath.join(dir, "me.wav")],
      ["repair", NodePath.join(dir, "them.wav")],
    ]);
    expect(rig.file("call-1", "1", "recording.json")).toEqual(
      recordingFile({
        endedAt: "2026-11-25T10:02:00.000Z",
        endReason: "app_quit",
        deleteAfter: "2026-12-02T10:02:00.000Z",
      }),
    );
  });

  it("Given an expired take beside a fresh one, when the sweep runs, then only the expired folders go", () => {
    const rig = setup();
    const ended = { endedAt: STARTED_AT, endReason: "stopped" } as const;
    writeTake(rig.root, "old-call", "1", { ...ended, deleteAfter: "2026-11-25T09:00:00.000Z" });
    writeTake(rig.root, "mixed-call", "1", { ...ended, deleteAfter: "2026-11-25T09:00:00.000Z" });
    writeTake(rig.root, "mixed-call", "2", { ...ended, deleteAfter: "2026-11-26T09:00:00.000Z" });
    writeTake(rig.root, "open-call", "1", {
      endedAt: null,
      endReason: null,
      deleteAfter: "2026-11-25T09:00:00.000Z",
    });
    writeTake(rig.root, "held-call", "1", { ...ended, deleteAfter: "2026-11-25T09:00:00.000Z" });
    const held = NodePath.join(rig.root, "held-call", "1");
    NodeFS.writeFileSync(NodePath.join(held, "me.wav"), "");
    // `them.wav` is a folder, so removing it as a file throws, as an open WAV does on Windows.
    NodeFS.mkdirSync(NodePath.join(held, "them.wav", "open"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(held, "them.wav", "open", "data"), "");
    NodeFS.chmodSync(NodePath.join(held, "them.wav", "open"), 0o555);
    try {
      rig.recorder.sweep();
    } finally {
      NodeFS.chmodSync(NodePath.join(held, "them.wav", "open"), 0o755);
    }
    const left = NodeFS.readdirSync(rig.root, { recursive: true }).toSorted();
    expect(left).toEqual([
      "held-call",
      NodePath.join("held-call", "1"),
      NodePath.join("held-call", "1", "recording.json"),
      NodePath.join("held-call", "1", "them.wav"),
      NodePath.join("held-call", "1", "them.wav", "open"),
      NodePath.join("held-call", "1", "them.wav", "open", "data"),
      "mixed-call",
      NodePath.join("mixed-call", "2"),
      NodePath.join("mixed-call", "2", "recording.json"),
      "open-call",
      NodePath.join("open-call", "1"),
      NodePath.join("open-call", "1", "recording.json"),
    ]);
  });

  it("Given Delete audio, then the call's folder is gone and the snapshot drops it, but never mid-recording", async () => {
    const rig = setup();
    writeTake(rig.root, "old-call", "1", {
      endedAt: STARTED_AT,
      endReason: "stopped",
      deleteAfter: "2026-12-02T10:00:00.000Z",
    });
    expect(rig.recorder.remove("old-call")).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(rig.root, "old-call"))).toBe(false);
    expect(rig.recorder.snapshot().recordings).toEqual([]);
    await startRecording(rig);
    expect(rig.recorder.remove("call-1")).toBe(false);
    rig.recorder.remove("CALL-1");
    expect(NodeFS.existsSync(NodePath.join(rig.root, "call-1", "1"))).toBe(true);
  });

  it("Given two takes of a call, when a file of one is opened, then it resolves inside that take's folder only", () => {
    const rig = setup();
    const later = "2026-11-25T11:00:00.000Z";
    const ended = { endReason: "stopped", deleteAfter: "2026-12-02T10:00:00.000Z" } as const;
    writeTake(rig.root, "old-call", "1", { ...ended, endedAt: STARTED_AT });
    writeTake(rig.root, "old-call", "2", { ...ended, startedAt: later, endedAt: later });
    expect(rig.recorder.fileOf({ callId: "old-call", startedAt: later, file: "me.wav" })).toBe(
      NodePath.join(rig.root, "old-call", "2", "me.wav"),
    );
    expect(
      rig.recorder.fileOf({ callId: "old-call", startedAt: STARTED_AT, file: "recording.json" }),
    ).toBe(NodePath.join(rig.root, "old-call", "1", "recording.json"));
    expect(
      rig.recorder.fileOf({
        callId: "old-call",
        startedAt: "2026-01-01T00:00:00.000Z",
        file: "me.wav",
      }),
    ).toBeNull();
  });

  it("Given a take's track, when a sample range is read, then it skips the WAV header and stops at the file's end", async () => {
    const rig = setup();
    const ended = { endReason: "stopped", deleteAfter: "2026-12-02T10:00:00.000Z" } as const;
    writeTake(rig.root, "old-call", "1", { ...ended, endedAt: STARTED_AT });
    const samples = Int16Array.of(7, -7, 300, -300);
    NodeFS.writeFileSync(
      NodePath.join(rig.root, "old-call", "1", "them.wav"),
      Buffer.concat([Buffer.alloc(44, 1), Buffer.from(samples.buffer)]),
    );
    const range = { callId: "old-call", startedAt: STARTED_AT, file: "them.wav" } as const;
    const read = async (from: number, to: number) => {
      const bytes = await rig.recorder.readTrack({ ...range, from, to });
      return bytes === null ? null : [...new Int16Array(bytes)];
    };
    expect(await read(1, 3)).toEqual([-7, 300]);
    expect(await read(2, 100)).toEqual([300, -300]);
    expect(await read(9, 12)).toEqual([]);
    expect(await read(0, 2)).toEqual([7, -7]);
    expect(
      await rig.recorder.readTrack({
        ...range,
        startedAt: "2026-01-01T00:00:00.000Z",
        from: 0,
        to: 2,
      }),
    ).toBeNull();
  });
});
