import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { app, BrowserWindow, ipcMain, nativeImage, Notification, shell } from "electron";

import type { RecorderSnapshot, RecorderState } from "../src/connection/engineState";
import type { CallApp } from "../src/domain/board";
import { CallId, Recording, RecordingFile, RecordRequest } from "../src/domain/recording";
import { createLocalStateFile } from "./localState";

const PROTOCOL = 1;
const KEEP_MS = 7 * 24 * 60 * 60_000;
const SWEEP_EVERY_MS = 60 * 60_000;
/** Them louder than this counts as someone talking. The helper floors silence at -100 dBFS. */
const SOUND_DBFS = -55;
const NUDGE_AFTER_S = 10 * 60;
const MAX_S = 4 * 60 * 60;
const HELPER = "agent-board-call-capture.exe";
const HELPER_TIMEOUT_MS = 10_000;
const FILES = { me: "me.wav", them: "them.wav" } as const;
const TRACKS: Recording["tracks"] = [
  { who: "me", file: FILES.me },
  { who: "them", file: FILES.them },
];

const CALL_EXES = {
  zoom: { exe: "Zoom.exe", name: "Zoom" },
  teams: { exe: "ms-teams.exe", name: "Teams" },
  chrome: { exe: "chrome.exe", name: "Chrome" },
  edge: { exe: "msedge.exe", name: "Edge" },
} as const satisfies Record<CallApp, { readonly exe: string; readonly name: string }>;

export const decodeRequest = Schema.decodeUnknownOption(RecordRequest);
export const decodeCallId = Schema.decodeUnknownOption(CallId);
const decodeRecordingFile = Schema.decodeUnknownOption(RecordingFile);
const isCallId = Schema.is(CallId);
// Struct drops keys it does not name, so every other app's window title ends here.
const decodeList = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      protocol: Schema.Number,
      supported: Schema.Boolean,
      processes: Schema.Array(Schema.Struct({ exe: Schema.String, pid: Schema.Number })),
    }),
  ),
);
const decodeEvent = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Union([
      Schema.Struct({
        event: Schema.Literal("started"),
        protocol: Schema.Number,
        exe: Schema.NullOr(Schema.String),
      }),
      Schema.Struct({ event: Schema.Literal("level"), t: Schema.Number, them: Schema.Number }),
      Schema.Struct({ event: Schema.Literal("warning"), code: Schema.String }),
      Schema.Struct({
        event: Schema.Literal("error"),
        code: Schema.String,
        message: Schema.String,
      }),
      Schema.Struct({
        event: Schema.Literal("stopped"),
        reason: Schema.String,
        seconds: Schema.Number,
      }),
      Schema.Struct({ event: Schema.Literal("repaired"), seconds: Schema.Number }),
    ]),
  ),
);
const decodeRecording = Schema.decodeUnknownOption(Schema.fromJsonString(Recording));
const decodeConsent = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ recordingConsent: Schema.Literal(true) })),
);

/** `agent-board-call-capture.exe`, behind a port so tests can script its output. */
export interface Helper {
  /** Runs `list` or `repair` and resolves to its stdout. */
  readonly run: (args: ReadonlyArray<string>) => Promise<string>;
  /** Starts `record`. `onClose` runs once the process has ended and every stdout line was read. */
  readonly spawn: (
    args: ReadonlyArray<string>,
    onLine: (line: string) => void,
    onClose: () => Promise<void>,
  ) => { readonly stop: () => void; readonly end: () => void };
}

interface Take {
  readonly dir: string;
  readonly recording: Recording;
}

interface Session {
  readonly request: RecordRequest;
  readonly dir: string;
  readonly pid: number;
  readonly child: ReturnType<Helper["spawn"]>;
  recording: Recording | null;
  micMissing: boolean;
  wrongAppMessage: string | null;
  error: { readonly code: string; readonly message: string } | null;
  stopped: { readonly reason: string; readonly seconds: number } | null;
  capped: boolean;
  soundAt: number;
  nudged: boolean;
}

/** How a take ended, from the helper's `stopped` reason. Only quitting the board closes stdin. */
function endReason(reason: string, capped: boolean): NonNullable<Recording["endReason"]> {
  if (reason === "error" || reason === "target_exited") return reason;
  if (reason === "stdin_closed") return "app_quit";
  return capped ? "max_duration" : "stopped";
}

const sameExe = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

const readDir = (dir: string): ReadonlyArray<string> => {
  try {
    return NodeFS.readdirSync(dir);
  } catch {
    return [];
  }
};

const removeDir = (dir: string) => {
  try {
    NodeFS.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows refuses while a player holds a file open. The next sweep or Delete audio retries.
  }
};

const removeIfEmpty = (dir: string) => {
  if (readDir(dir).length === 0) removeDir(dir);
};

/** The WAVs go before `recording.json`, so a WAV that cannot go keeps the take listed for the next retry. */
const removeTake = (dir: string) => {
  try {
    for (const { file } of TRACKS) NodeFS.rmSync(NodePath.join(dir, file), { force: true });
  } catch {
    return;
  }
  removeDir(dir);
  removeIfEmpty(NodePath.dirname(dir));
};

const recordingFile = (dir: string) => createLocalStateFile(NodePath.join(dir, "recording.json"));

/** Owns the one helper child and everything under `root`, one folder per call, one per take. */
export function createRecorder(deps: {
  readonly root: string;
  readonly helper: Helper;
  readonly now: () => Date;
  readonly consented: () => boolean;
  readonly publish: (snapshot: RecorderSnapshot) => void;
  readonly nudge: (title: string) => void;
}) {
  const { root, helper } = deps;
  let state: RecorderState = { status: "idle", failed: null };
  let session: Session | null = null;

  const takes = (): ReadonlyArray<Take> =>
    readDir(root)
      .filter(isCallId)
      .flatMap((callId) =>
        readDir(NodePath.join(root, callId)).flatMap((take) => {
          const dir = NodePath.join(root, callId, take);
          return Option.match(decodeRecording(recordingFile(dir).read()), {
            onNone: () => [],
            onSome: (recording) => [{ dir, recording }],
          });
        }),
      );
  const snapshot = (): RecorderSnapshot => ({
    state,
    recordings: takes().map((take) => take.recording),
  });
  const set = (next: RecorderState) => {
    state = next;
    deps.publish(snapshot());
  };
  const save = ({ dir, recording }: Take) =>
    recordingFile(dir).write(JSON.stringify(recording, null, 2));
  const repair = async (dir: string) => {
    const seconds = await Promise.all(
      TRACKS.map(async ({ file }) =>
        Option.match(decodeEvent((await helper.run(["repair", NodePath.join(dir, file)])).trim()), {
          onNone: () => 0,
          onSome: (event) => (event.event === "repaired" ? event.seconds : 0),
        }),
      ),
    );
    return Math.max(...seconds);
  };
  const end = (
    take: Take,
    endReason: NonNullable<Recording["endReason"]>,
    seconds: number,
    error: string | null,
  ) => {
    const endedAt = plus(take.recording.startedAt, Math.round(seconds * 1000));
    save({
      ...take,
      recording: {
        ...take.recording,
        endedAt,
        endReason,
        error,
        deleteAfter: plus(endedAt, KEEP_MS),
      },
    });
  };

  const onLine = (current: Session, line: string) => {
    const event = Option.getOrUndefined(decodeEvent(line));
    const { name, exe } = CALL_EXES[current.request.app];
    switch (event?.event) {
      case "started": {
        if (event.protocol !== PROTOCOL || !sameExe(event.exe, exe)) {
          current.wrongAppMessage = `The recorder found ${event.exe ?? "no app"}, not ${name}.`;
          current.child.stop();
          return;
        }
        const startedAt = deps.now().toISOString();
        current.recording = {
          ...current.request,
          exe,
          targetPid: current.pid,
          startedAt,
          endedAt: null,
          endReason: null,
          error: null,
          tracks: TRACKS,
          deleteAfter: plus(startedAt, KEEP_MS),
        };
        save({ dir: current.dir, recording: current.recording });
        set({
          status: "recording",
          callId: current.request.callId,
          title: current.request.title,
          startedAt,
          micMissing: current.micMissing,
        });
        return;
      }
      case "level": {
        if (current.recording === null) return;
        if (event.them > SOUND_DBFS) {
          current.soundAt = event.t;
          current.nudged = false;
        } else if (!current.nudged && event.t - current.soundAt >= NUDGE_AFTER_S) {
          current.nudged = true;
          deps.nudge(current.request.title);
        }
        if (event.t >= MAX_S && !current.capped) {
          current.capped = true;
          current.child.stop();
        }
        return;
      }
      case "warning": {
        if (event.code !== "mic_unavailable" && event.code !== "mic_reopened") return;
        current.micMissing = event.code === "mic_unavailable";
        if (state.status === "recording" && state.micMissing !== current.micMissing) {
          set({ ...state, micMissing: current.micMissing });
        }
        return;
      }
      case "error":
        current.error = { code: event.code, message: event.message };
        return;
      case "stopped":
        current.stopped = { reason: event.reason, seconds: event.seconds };
        return;
    }
  };

  const onClose = async (current: Session) => {
    const { dir, recording, stopped, error } = current;
    session = null;
    if (recording === null) {
      removeDir(dir);
      removeIfEmpty(NodePath.dirname(dir));
      const { name } = CALL_EXES[current.request.app];
      const message =
        current.wrongAppMessage ??
        (error?.code === "target_not_found"
          ? `${name} is not running.`
          : (error?.message ?? "The recorder stopped before it started."));
      set({ status: "idle", failed: { callId: current.request.callId, message } });
      return;
    }
    const take = { dir, recording };
    try {
      if (stopped === null) {
        end(take, "crashed", await repair(dir), error?.message ?? null);
      } else {
        end(
          take,
          endReason(stopped.reason, current.capped),
          stopped.seconds,
          error?.message ?? null,
        );
      }
    } catch {
      // `recording.json` keeps `endedAt` null, so the next launch recovers the take.
    }
    set({ status: "idle", failed: null });
  };

  const fail = (callId: string, message: string) =>
    set({ status: "idle", failed: { callId, message } });

  const begin = async (request: RecordRequest) => {
    set({ status: "starting", callId: request.callId });
    const listed = Option.getOrUndefined(decodeList((await helper.run(["list"])).trim()));
    const { exe, name } = CALL_EXES[request.app];
    if (listed === undefined || listed.protocol !== PROTOCOL) {
      return fail(request.callId, "The recorder could not start. Reinstall the board.");
    }
    if (!listed.supported) {
      return fail(request.callId, "This Windows version is too old to record one app's audio.");
    }
    const target = listed.processes.find((process) => sameExe(process.exe, exe));
    if (target === undefined) return fail(request.callId, `${name} is not running.`);
    const callDir = NodePath.join(root, request.callId);
    const take = Math.max(0, ...readDir(callDir).map(Number).filter(Number.isInteger)) + 1;
    const dir = NodePath.join(callDir, String(take));
    NodeFS.mkdirSync(dir, { recursive: true });
    const current: Session = {
      request,
      dir,
      pid: target.pid,
      recording: null,
      micMissing: false,
      wrongAppMessage: null,
      error: null,
      stopped: null,
      capped: false,
      soundAt: 0,
      nudged: false,
      child: helper.spawn(
        [
          "record",
          "--pid",
          String(target.pid),
          "--them",
          NodePath.join(dir, FILES.them),
          "--me",
          NodePath.join(dir, FILES.me),
        ],
        (line) => onLine(current, line),
        () => onClose(current),
      ),
    };
    session = current;
  };

  return {
    snapshot,
    start: async (request: RecordRequest) => {
      if (state.status !== "idle" || !deps.consented()) return;
      await begin(request).catch((cause: unknown) =>
        fail(request.callId, `The recorder could not start. ${String(cause)}`),
      );
    },
    stop: () => session?.child.stop(),
    /** Closes the helper's stdin, which finalizes both files and ends the take as `app_quit`. */
    quit: () => session?.child.end(),
    /** Where one file of a take is, or null when no take of the call started then. */
    fileOf: ({ callId, startedAt, file }: RecordingFile) => {
      const take = takes().find(
        ({ recording }) => recording.callId === callId && recording.startedAt === startedAt,
      );
      return take === undefined ? null : NodePath.join(take.dir, file);
    },
    /** True once no take of the call is left on this PC. */
    remove: (callId: string) => {
      // NTFS folder names ignore case, so `abc` and `ABC` share one folder.
      if (session?.request.callId.toLowerCase() === callId.toLowerCase()) return false;
      const callDir = NodePath.join(root, callId);
      for (const take of readDir(callDir)) removeTake(NodePath.join(callDir, take));
      deps.publish(snapshot());
      return readDir(callDir).length === 0;
    },
    /** Ends every take a quit or crash of the board left open. Runs at launch, before any Record. */
    recover: async () => {
      for (const take of takes().filter(({ recording }) => recording.endedAt === null)) {
        const seconds = await repair(take.dir);
        try {
          end(take, "app_quit", seconds, null);
        } catch {
          // The next launch tries this take again.
        }
      }
      deps.publish(snapshot());
    },
    sweep: () => {
      const now = deps.now().getTime();
      const expired = takes().filter(
        ({ recording }) => recording.endedAt !== null && Date.parse(recording.deleteAfter) <= now,
      );
      for (const { dir } of expired) removeTake(dir);
      if (expired.length > 0) deps.publish(snapshot());
    },
  };
}

/** `nativeImage.createFromBitmap` reads BGRA pixels. */
function icon(
  inside: (x: number, y: number) => boolean,
  [r, g, b]: readonly [number, number, number],
) {
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inside(x + 0.5 - size / 2, y + 0.5 - size / 2)) {
        pixels.set([b, g, r, 255], (y * size + x) * 4);
      }
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size });
}

function nodeHelper(exe: string): Helper {
  return {
    run: (args) =>
      new Promise((resolve) => {
        NodeChildProcess.execFile(
          exe,
          [...args],
          { windowsHide: true, timeout: HELPER_TIMEOUT_MS },
          (_error, stdout) => resolve(stdout),
        );
      }),
    spawn: (args, onLine, onClose) => {
      const child = NodeChildProcess.spawn(exe, [...args], {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
      child.stdin.on("error", () => undefined);
      child.on("error", () => undefined);
      NodeReadline.createInterface({ input: child.stdout }).on("line", onLine);
      child.on("close", () => void onClose());
      return { stop: () => child.stdin.write("stop\n"), end: () => child.stdin.end() };
    },
  };
}

export function registerRecorder(platform: NodeJS.Platform) {
  if (platform !== "win32") {
    ipcMain.handle("board:recorder-state", () => null);
    return { quit: () => undefined };
  }
  const userData = app.getPath("userData");
  const localState = createLocalStateFile(NodePath.join(userData, "local-state.json"));
  const exe = NodePath.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), HELPER);
  const recording = icon((x, y) => x * x + y * y <= 36, [229, 72, 77]);
  const stopIcon = icon((x, y) => Math.abs(x) <= 5 && Math.abs(y) <= 5, [248, 250, 252]);
  const windows = () => BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());

  const recorder = createRecorder({
    root: NodePath.join(userData, "recordings"),
    helper: nodeHelper(exe),
    now: () => new Date(),
    consented: () => Option.isSome(decodeConsent(localState.read())),
    publish: (snapshot) => {
      const on = snapshot.state.status === "recording";
      for (const window of windows()) {
        window.webContents.send("board:recorder-state", snapshot);
        window.setOverlayIcon(on ? recording : null, on ? "Recording a call" : "");
        window.setThumbarButtons(
          on ? [{ tooltip: "Stop recording", icon: stopIcon, click: () => recorder.stop() }] : [],
        );
      }
    },
    nudge: (title) => {
      if (!Notification.isSupported()) return;
      const notice = new Notification({
        title: "Is the call still on?",
        body: `${title} has had no call audio for ${NUDGE_AFTER_S / 60} minutes. Recording continues until you press Stop.`,
      });
      notice.on("click", () => windows()[0]?.show());
      notice.show();
    },
  });

  ipcMain.handle("board:recorder-state", () => recorder.snapshot());
  ipcMain.on("board:recorder-start", (_event, request) =>
    Option.map(decodeRequest(request), (valid) => void recorder.start(valid)),
  );
  ipcMain.on("board:recorder-stop", () => recorder.stop());
  // With no app for the file type, openPath resolves to an error, so the folder opens instead.
  ipcMain.handle("board:recording-open", async (_event, file) => {
    const path = Option.match(decodeRecordingFile(file), {
      onNone: () => null,
      onSome: recorder.fileOf,
    });
    if (path === null) return "missing";
    if ((await shell.openPath(path)) === "") return "opened";
    shell.showItemInFolder(path);
    return "folder";
  });
  ipcMain.handle("board:recorder-delete", (_event, callId) =>
    Option.match(decodeCallId(callId), { onNone: () => false, onSome: recorder.remove }),
  );

  void recorder.recover().finally(() => recorder.sweep());
  setInterval(() => recorder.sweep(), SWEEP_EVERY_MS);
  return { quit: recorder.quit };
}
