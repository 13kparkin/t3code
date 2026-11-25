import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RecorderSnapshot, Recording } from "../src/connection/engineState";

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

  it("Given a recording, when the call app quits, then the recording ends with target_exited", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    child.print({ event: "stopped", reason: "target_exited", seconds: 600 });
    await child.close();
    expect(rig.statuses()).toEqual(["starting", "recording", "idle"]);
    expect(rig.file("call-1", "1", "recording.json")).toMatchObject({
      endReason: "target_exited",
      endedAt: "2026-11-25T10:10:00.000Z",
    });
  });

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

  it("Given a finished take, when Record is pressed again on the same call, then the helper gets new paths", async () => {
    const rig = setup();
    const first = await startRecording(rig);
    first.print({ event: "stopped", reason: "stop", seconds: 5 });
    await first.close();
    await startRecording(rig);
    expect(rig.children[1]?.args[4]).toBe(NodePath.join(rig.root, "call-1", "2", "them.wav"));
    expect(rig.file("call-1", "1", "recording.json")).toMatchObject({ endReason: "stopped" });
  });

  it("Given the app named on the card is not running, then no helper starts and the card says so", async () => {
    const rig = setup({
      list: JSON.stringify({ protocol: 1, build: 22631, supported: true, processes: [] }),
    });
    await rig.recorder.start(REQUEST);
    expect(rig.children).toEqual([]);
    expect(rig.lastState()).toEqual({
      status: "idle",
      failed: { callId: "call-1", message: "Chrome is not running." },
    });
    expect(NodeFS.readdirSync(rig.root)).toEqual([]);
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

  it("Given no saved consent, then nothing runs", async () => {
    const rig = setup({ consented: false });
    await rig.recorder.start(REQUEST);
    expect([rig.runs, rig.statuses()]).toEqual([[], []]);
  });

  it.each(["../escape", "", "a".repeat(65), "call 1", "call_1"])(
    "Given the call id %j, then neither Record nor Delete audio parses",
    (callId) => {
      expect(Option.isNone(decodeRequest({ ...REQUEST, callId }))).toBe(true);
      expect(Option.isNone(decodeCallId(callId))).toBe(true);
    },
  );

  it("Given every snapshot, then no other app's window title reaches the renderer", async () => {
    const rig = setup();
    const child = await startRecording(rig);
    child.print({ event: "stopped", reason: "stop", seconds: 5 });
    await child.close();
    expect(JSON.stringify(rig.recorder.snapshot())).not.toContain("Private chat");
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
    await rig.recorder.recover();
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
    rig.recorder.sweep();
    const left = NodeFS.readdirSync(rig.root, { recursive: true }).toSorted();
    expect(left).toEqual([
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
    rig.recorder.remove("old-call");
    expect(NodeFS.existsSync(NodePath.join(rig.root, "old-call"))).toBe(false);
    expect(rig.recorder.snapshot().recordings).toEqual([]);
    await startRecording(rig);
    rig.recorder.remove("call-1");
    expect(NodeFS.existsSync(NodePath.join(rig.root, "call-1", "1"))).toBe(true);
  });
});
