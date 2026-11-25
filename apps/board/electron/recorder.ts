import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { app, BrowserWindow, ipcMain, nativeImage, Notification } from "electron";

import type {
  RecorderSnapshot,
  RecorderState,
  Recording,
  RecordRequest,
} from "../src/connection/engineState";
import { CallApp } from "../src/domain/board";
import { createLocalStateFile } from "./localState";

const PROTOCOL = 1;
const KEEP_MS = 7 * 24 * 60 * 60_000;
const SWEEP_EVERY_MS = 60 * 60_000;
/** Them louder than this counts as someone talking. The helper floors silence at -100 dBFS. */
const SOUND_DBFS = -55;
const NUDGE_AFTER_S = 10 * 60;
const MAX_S = 4 * 60 * 60;
const HELPER = "agent-board-call-capture.exe";
const CALL_ID = /^[A-Za-z0-9-]{1,64}$/;
const TRACKS: Recording["tracks"] = [
  { who: "me", file: "me.wav" },
  { who: "them", file: "them.wav" },
];

const CALL_EXES = {
  zoom: { exe: "Zoom.exe", name: "Zoom" },
  teams: { exe: "ms-teams.exe", name: "Teams" },
  chrome: { exe: "chrome.exe", name: "Chrome" },
  edge: { exe: "msedge.exe", name: "Edge" },
} as const satisfies Record<CallApp, { readonly exe: string; readonly name: string }>;

/** Every call id is checked against `CALL_ID` here, before any path is built from it. */
export const decodeRequest = Schema.decodeUnknownOption(
  Schema.Struct({
    callId: Schema.String.check(Schema.isPattern(CALL_ID)),
    boardId: Schema.String.check(Schema.isMaxLength(200)),
    title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
    app: CallApp,
  }),
);
export const decodeCallId = Schema.decodeUnknownOption(
  Schema.String.check(Schema.isPattern(CALL_ID)),
);
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
const decodeRecording = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      callId: Schema.String,
      boardId: Schema.String,
      title: Schema.String,
      app: CallApp,
      exe: Schema.String,
      targetPid: Schema.Number,
      startedAt: Schema.String,
      endedAt: Schema.NullOr(Schema.String),
      endReason: Schema.NullOr(
        Schema.Literals([
          "stopped",
          "target_exited",
          "max_duration",
          "error",
          "crashed",
          "app_quit",
        ]),
      ),
      error: Schema.NullOr(Schema.String),
      tracks: Schema.Array(
        Schema.Struct({ who: Schema.Literals(["me", "them"]), file: Schema.String }),
      ),
      deleteAfter: Schema.String,
    }),
  ),
);
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
  /** Null until the helper starts on the right app. */
  recording: Recording | null;
  micMissing: boolean;
  /** Set when the helper started on the wrong process, so the take is thrown away. */
  discard: string | null;
  error: { readonly code: string; readonly message: string } | null;
  stopped: { readonly reason: string; readonly seconds: number } | null;
  capped: boolean;
  soundAt: number;
  nudged: boolean;
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

const removeIfEmpty = (dir: string) => {
  if (readDir(dir).length === 0) NodeFS.rmSync(dir, { recursive: true, force: true });
};

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
      .filter((callId) => CALL_ID.test(callId))
      .flatMap((callId) =>
        readDir(NodePath.join(root, callId)).flatMap((take) => {
          const dir = NodePath.join(root, callId, take);
          const text = (() => {
            try {
              return NodeFS.readFileSync(NodePath.join(dir, "recording.json"), "utf8");
            } catch {
              return "";
            }
          })();
          return Option.match(decodeRecording(text), {
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
  const save = ({ dir, recording }: Take) => {
    const file = NodePath.join(dir, "recording.json");
    NodeFS.writeFileSync(`${file}.tmp`, JSON.stringify(recording, null, 2));
    NodeFS.renameSync(`${file}.tmp`, file);
  };
  /** The longest track after `repair`, in seconds. A track the helper cannot read counts as 0. */
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
          current.discard = `The recorder found ${event.exe ?? "no app"}, not ${name}.`;
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
    if (recording === null) {
      NodeFS.rmSync(dir, { recursive: true, force: true });
      removeIfEmpty(NodePath.dirname(dir));
      session = null;
      const { name } = CALL_EXES[current.request.app];
      const message =
        current.discard ??
        (error?.code === "target_not_found"
          ? `${name} is not running.`
          : (error?.message ?? "The recorder stopped before it started."));
      set({ status: "idle", failed: { callId: current.request.callId, message } });
      return;
    }
    const take = { dir, recording };
    if (stopped === null) {
      end(take, "crashed", await repair(dir), error?.message ?? null);
    } else {
      const reason =
        stopped.reason === "error"
          ? "error"
          : stopped.reason === "target_exited"
            ? "target_exited"
            : current.capped
              ? "max_duration"
              : "stopped";
      end(take, reason, stopped.seconds, error?.message ?? null);
    }
    session = null;
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
    const track = (who: "me" | "them") => NodePath.join(dir, `${who}.wav`);
    const pending: Omit<Session, "child"> = {
      request,
      dir,
      pid: target.pid,
      recording: null,
      micMissing: false,
      discard: null,
      error: null,
      stopped: null,
      capped: false,
      soundAt: 0,
      nudged: false,
    };
    const current: Session = {
      ...pending,
      child: helper.spawn(
        ["record", "--pid", String(target.pid), "--them", track("them"), "--me", track("me")],
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
    stop: () => {
      if (state.status === "recording") session?.child.stop();
    },
    /** Closes the helper's stdin, which finalizes both files. The next launch marks the take `app_quit`. */
    quit: () => session?.child.end(),
    remove: (callId: string) => {
      if (session?.request.callId === callId) return;
      NodeFS.rmSync(NodePath.join(root, callId), { recursive: true, force: true });
      deps.publish(snapshot());
    },
    /** Ends every take a quit or crash of the board left open. Runs at launch, before any Record. */
    recover: async () => {
      for (const take of takes()) {
        if (take.recording.endedAt === null) end(take, "app_quit", await repair(take.dir), null);
      }
      deps.publish(snapshot());
    },
    sweep: () => {
      const now = deps.now().getTime();
      const expired = takes().filter(
        ({ recording }) => recording.endedAt !== null && Date.parse(recording.deleteAfter) <= now,
      );
      for (const { dir } of expired) {
        NodeFS.rmSync(dir, { recursive: true, force: true });
        removeIfEmpty(NodePath.dirname(dir));
      }
      if (expired.length > 0) deps.publish(snapshot());
    },
  };
}

/** A 16 px square bitmap, BGRA, filled where `inside` says. */
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
        NodeChildProcess.execFile(exe, [...args], { windowsHide: true }, (_error, stdout) =>
          resolve(String(stdout ?? "")),
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
  const win32 = platform === "win32";
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
        if (!win32) continue;
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
        body: `${title} has had no call audio for 10 minutes. Recording continues until you press Stop.`,
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
  ipcMain.on("board:recording-delete", (_event, callId) =>
    Option.map(decodeCallId(callId), recorder.remove),
  );

  void recorder.recover().then(() => recorder.sweep());
  setInterval(() => recorder.sweep(), SWEEP_EVERY_MS);
  return { quit: recorder.quit };
}
