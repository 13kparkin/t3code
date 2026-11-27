import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { RemoteEnvironmentAuthUndeclaredStatusError } from "@t3tools/client-runtime/rpc";
import { transcribeEnvironmentPcm } from "@t3tools/client-runtime/voice-input";
import {
  DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
  EnvironmentRequestInvalidError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Atom, AtomRegistry } from "effect/reactivity";

import { splitCalls } from "../calls/splitCalls";
import { callsToTranscribe, type Transcription } from "../calls/recorder";
import { sameTakes, transcribeTakes } from "../calls/transcribe";
import type { RecorderSnapshot } from "../connection/engineState";
import { BOARDS_DIR, type CallEvent } from "../domain/board";
import { callNotesMessage, callNotesPath } from "../domain/callNotes";
import { messageOrchestrator } from "../foryou/actions";
import type { RecordingFile } from "../domain/recording";
import { readBoard, type ValidBoard } from "../store/boardFiles";
import { deleteCall, markRecorded, saveCall } from "./boardCards";
import { boardEngine, localState, newId, projectBoardsAtom } from "./boards";
import { environmentProjects } from "./projects";
import { errorText, modelInstalled, readSpeechStatus, runSpeech, speechStatusAtom } from "./speech";

/** Undefined in `dev:web`, which has no main process to record with. */
const recorder = window.board?.recorder;
/** The recorder reads idle until main answers a start, so a press waits on this until main's next snapshot. */
let starting = false;

/** Null in `dev:web` and off Windows, where the Calls group offers no Record a call. */
export const recorderAtom = Atom.make((get): RecorderSnapshot | null => {
  if (recorder === undefined) return null;
  // Subscribe before the read so a change between the two is not lost.
  get.addFinalizer(
    recorder.onSnapshot((snapshot) => {
      starting = false;
      get.setSelf(snapshot);
    }),
  );
  void recorder.snapshot().then((snapshot) => get.setSelf(snapshot));
  return null;
}).pipe(Atom.keepAlive, Atom.withLabel("call-recorder"));

/** Ticks once a second, only while something reads it. */
export const secondAtom = Atom.make((get): number => {
  const timer = setInterval(() => get.refreshSelf(), 1000);
  get.addFinalizer(() => clearInterval(timer));
  return Date.now();
}).pipe(Atom.withLabel("recorder-second"));

export interface BoardCall extends CallEvent {
  readonly project: EnvironmentProject;
  readonly listed: ValidBoard;
}

/** The calls on every board the sidebar lists, without archived ones. */
export const boardCallsAtom = Atom.make((get): ReadonlyArray<BoardCall> =>
  get(environmentProjects.projectsAtom)
    .filter((project) => project.archivedAt == null)
    .flatMap((project) => {
      const boards = get(projectBoardsAtom(project.id));
      if (boards.status !== "ready") return [];
      return boards.boards.flatMap((listed) => {
        if (!listed.ok || listed.board.archived) return [];
        return (listed.board.calls ?? [])
          .filter((call) => listed.board.cardStates?.[call.id] !== "archived")
          .map((call) => ({ ...call, project, listed }));
      });
    }),
).pipe(Atom.withLabel("board-calls"));

/** Each call with takes on this PC, to its first take's start. */
const firstTakes = (snapshot: RecorderSnapshot) => {
  const first = new Map<string, string>();
  for (const { callId, startedAt } of snapshot.recordings) {
    const known = first.get(callId);
    if (known === undefined || Date.parse(startedAt) < Date.parse(known)) {
      first.set(callId, startedAt);
    }
  }
  return first;
};

/** `splitCalls` with this PC's recording and takes, which stay unknown until the snapshot loads. */
export const splitHere = <C extends CallEvent>(
  list: ReadonlyArray<C>,
  now: number,
  snapshot: RecorderSnapshot | null,
) =>
  splitCalls(
    list,
    now,
    snapshot === null || snapshot.state.status === "idle" ? null : snapshot.state.callId,
    snapshot === null ? null : firstTakes(snapshot),
  );

/** A failed write still refreshes the boards, which runs the sweep again, so a write is tried once per launch. */
const tried = new Set<string>();
const once = (key: string) => !tried.has(key) && Boolean(tried.add(key));

/** Marks every call this PC holds takes for, and removes finished calls never recorded. */
export const callSweepAtom = Atom.make((get) => {
  const snapshot = get(recorderAtom);
  if (snapshot === null) return;
  const split = splitHere(get(boardCallsAtom), Date.now(), snapshot);
  for (const call of split.mark) {
    if (once(`mark ${call.id}`)) {
      void markRecorded(get.registry, call.project, call.listed, call.id, call.recordedAt);
    }
  }
  // A dev build's seeded projects point at the developer's live checkout, as in projectBoardsAtom.
  for (const call of import.meta.env.DEV ? [] : split.stale) {
    if (once(`remove ${call.id}`)) {
      void deleteCall(get.registry, call.project, call.listed, call.id, call);
    }
  }
}).pipe(Atom.withLabel("call-sweep"));

/** What the board asks before it records: the consent notice, or that another call records. */
export const callPromptAtom = Atom.make<
  | {
      readonly kind: "consent";
      readonly project: EnvironmentProject;
      readonly listed: ValidBoard;
      readonly report: (failure: string | null) => void;
    }
  | { readonly kind: "busy" }
  | null
>(null).pipe(Atom.keepAlive, Atom.withLabel("call-prompt"));

/** Adds a call that starts now and records it. `report` gets the failure text, or null. */
export async function recordNewCall(
  registry: AtomRegistry.AtomRegistry,
  project: EnvironmentProject,
  listed: ValidBoard,
  report: (failure: string | null) => void,
) {
  if (recorder === undefined || starting) return;
  if ((registry.get(recorderAtom)?.state.status ?? "idle") !== "idle") {
    return registry.set(callPromptAtom, { kind: "busy" });
  }
  starting = true;
  let sent = false;
  try {
    if (!(await localState.read()).recordingConsent) {
      return registry.set(callPromptAtom, { kind: "consent", project, listed, report });
    }
    // v1 records Chrome only, the one app verified on Windows.
    const call: CallEvent = {
      id: newId(),
      title: "Call",
      start: new Date().toISOString(),
      app: "chrome",
    };
    const failure = await saveCall(registry, project, listed, call);
    if (failure === null) {
      sent = true;
      recorder.start({
        callId: call.id,
        boardId: listed.board.id,
        title: call.title,
        app: call.app,
      });
    }
    report(failure);
  } finally {
    if (!sent) starting = false;
  }
}

export const acceptConsent = () =>
  localState.update((state) => ({ ...state, recordingConsent: true }));

export const stopRecording = () => recorder?.stop();
export const openRecordingFile = (file: RecordingFile) =>
  recorder?.openFile(file) ?? Promise.resolve("missing" as const);
export const deleteAudio = (callId: string) =>
  recorder?.deleteAudio(callId) ?? Promise.resolve(false);

/** Relative to the board folder. */
export const transcriptPath = (callId: string) => `artifacts/calls/${callId}/transcript.md`;

/** By call id, on this PC only. */
export const transcriptionsAtom = Atom.make<Readonly<Record<string, Transcription>>>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("call-transcriptions"),
);

const isInvalidRequest = Schema.is(EnvironmentRequestInvalidError);
const isUndeclaredStatus = Schema.is(RemoteEnvironmentAuthUndeclaredStatusError);

const installIn = (model: string) => `Install ${model} in the board's Settings, Voice.`;

/** The engine's errors in plain words. A missing model comes back as a generic invalid command. */
function failure(cause: unknown, model: string) {
  if (isInvalidRequest(cause) && cause.reason === "invalid_command") {
    return `${installIn(model)} Then press Try again.`;
  }
  if (isInvalidRequest(cause) && cause.reason === "speech_busy") {
    return "Another speech task is running on the engine. Try again when it finishes.";
  }
  if (isUndeclaredStatus(cause) && cause.status === 503) {
    return "The engine stopped. Try again once it is back.";
  }
  return errorText(cause);
}

type NotesRequest =
  | { readonly status: "sending" | "sent" }
  | { readonly status: "failed"; readonly message: string };

/** By call id, on this PC only. The notes card itself comes from `notes.json`. */
export const callNotesRequestsAtom = Atom.make<Readonly<Record<string, NotesRequest>>>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("call-notes-requests"),
);

export async function requestCallNotes(
  registry: AtomRegistry.AtomRegistry,
  project: Pick<EnvironmentProject, "environmentId" | "workspaceRoot">,
  folder: string,
  call: Pick<CallEvent, "id" | "title">,
) {
  if (registry.get(callNotesRequestsAtom)[call.id]?.status === "sending") return;
  const set = (request: NotesRequest) =>
    registry.update(callNotesRequestsAtom, (all) => ({ ...all, [call.id]: request }));
  set({ status: "sending" });
  const dir = `${project.workspaceRoot}/${BOARDS_DIR}/${folder}`;
  try {
    // Read fresh, since the orchestrator may have started while the transcript was written.
    const { orchestratorThreadId } = await readBoard(
      boardEngine(registry, project.environmentId).files,
      project.workspaceRoot,
      folder,
    );
    if (orchestratorThreadId === null) {
      return set({
        status: "failed",
        message: "Start this board's orchestrator, then press Write call notes.",
      });
    }
    const failure = await messageOrchestrator(
      registry,
      project.environmentId,
      orchestratorThreadId,
      async () =>
        callNotesMessage({
          callId: call.id,
          title: call.title,
          transcript: `${dir}/${transcriptPath(call.id)}`,
          notes: `${dir}/${callNotesPath(call.id)}`,
        }),
    );
    set(failure === null ? { status: "sent" } : { status: "failed", message: failure });
  } catch (cause) {
    set({ status: "failed", message: errorText(cause) });
  }
}

/** Runs each call whose takes on this PC have all ended, once, and again when its missing model is installed. */
export const autoTranscribeAtom = Atom.make((get) => {
  const snapshot = get(recorderAtom);
  if (snapshot === null) return;
  const due = callsToTranscribe(
    get(boardCallsAtom),
    snapshot.recordings,
    get(transcriptionsAtom),
    modelInstalled(get(speechStatusAtom)),
  );
  // A run writes the jobs this atom reads, so it starts after the read.
  for (const call of due) {
    queueMicrotask(
      () => void transcribeCall(get.registry, call.project, call.listed.folder, call.id),
    );
  }
}).pipe(Atom.withLabel("auto-transcribe"));

/** Uses the engine's selected speech model. A failure keeps the audio and shows on the call. */
export async function transcribeCall(
  registry: AtomRegistry.AtomRegistry,
  project: Pick<EnvironmentProject, "environmentId" | "workspaceRoot">,
  folder: string,
  callId: string,
) {
  if (recorder === undefined || registry.get(transcriptionsAtom)[callId]?.status === "running") {
    return;
  }
  const set = (job: Transcription | null) =>
    registry.update(transcriptionsAtom, ({ [callId]: _old, ...rest }) =>
      job === null ? rest : { ...rest, [callId]: job },
    );
  const takesOf = () =>
    (registry.get(recorderAtom)?.recordings ?? []).filter((take) => take.callId === callId);
  const takes = takesOf()
    .filter((take) => take.endedAt !== null)
    .toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const [first] = takes;
  if (first === undefined) return;
  set({ status: "running", done: 0, total: 0 });
  let model = "a speech model";
  try {
    const status = await readSpeechStatus(registry, project.environmentId);
    if (!status.supported) throw new Error(status.reason);
    model = status.model;
    if (status.state === "missing-model") {
      return set({
        status: "failed",
        message: `${installIn(model)} The board transcribes again once it is installed.`,
        missingModel: true,
      });
    }
    await transcribeTakes({
      takes,
      read: recorder.readTrack,
      transcribe: async (pcm) =>
        (
          await runSpeech(registry, project.environmentId, (prepared) =>
            transcribeEnvironmentPcm(
              prepared,
              pcm,
              DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
              () => true,
            ),
          )
        ).text,
      write: (markdown) =>
        boardEngine(registry, project.environmentId).files.write(
          project.workspaceRoot,
          `${BOARDS_DIR}/${folder}/${transcriptPath(callId)}`,
          markdown,
        ),
      deleteAudio: async () => sameTakes(takes, takesOf()) && recorder.deleteAudio(callId),
      progress: (done, total) => set({ status: "running", done, total }),
    });
    set({ status: "written" });
    void requestCallNotes(registry, project, folder, { id: callId, title: first.title });
  } catch (cause) {
    set({ status: "failed", message: failure(cause, model), missingModel: false });
  }
}
