import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { EnvironmentRegistry, EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { RemoteEnvironmentAuthUndeclaredStatusError } from "@t3tools/client-runtime/rpc";
import {
  getEnvironmentSpeechStatus,
  transcribeEnvironmentPcm,
} from "@t3tools/client-runtime/voice-input";
import {
  DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
  EnvironmentRequestInvalidError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { HttpClient } from "effect/http";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/reactivity";

import { dueCalls, isStarting, markNotified, nextWake, splitCalls } from "../calls/dueCalls";
import { sameTakes, transcribeTakes } from "../calls/transcribe";
import type { RecorderSnapshot } from "../connection/engineState";
import { connectionAtomRuntime } from "../connection/runtime";
import { BOARDS_DIR, type CallEvent } from "../domain/board";
import { callNotesMessage, callNotesPath } from "../domain/callNotes";
import { messageOrchestrator } from "../foryou/actions";
import type { RecordingFile, RecordRequest } from "../domain/recording";
import type { ValidBoard } from "../store/boardFiles";
import { deleteCall, markRecorded } from "./boardCards";
import { boardEngine, localState, openBoard, projectBoardsAtom } from "./boards";
import { environmentProjects } from "./projects";

/** Undefined in `dev:web`, which has no main process to record with. */
const recorder = window.board?.recorder;
const calls = window.board?.calls;

/** Null in `dev:web` and off Windows, where the call cards offer no Record. */
export const recorderAtom = Atom.make((get): RecorderSnapshot | null => {
  if (recorder === undefined) return null;
  // Subscribe before the read so a change between the two is not lost.
  get.addFinalizer(recorder.onSnapshot((snapshot) => get.setSelf(snapshot)));
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

/** Saves each due call as notified before its toast shows, so a crash never shows it twice. */
async function notifyDue(list: ReadonlyArray<BoardCall>, now: number) {
  if (calls === undefined) return;
  if (dueCalls(list, now, (await localState.read()).notifiedCalls).length === 0) return;
  let due: ReadonlyArray<BoardCall> = [];
  await localState.update((state) => {
    due = dueCalls(list, now, state.notifiedCalls);
    return { ...state, notifiedCalls: markNotified(state.notifiedCalls, due, now) };
  });
  for (const call of due) {
    calls.notify({
      projectId: call.project.id,
      folder: call.listed.folder,
      request: { callId: call.id, boardId: call.listed.board.id, title: call.title, app: call.app },
    });
  }
}

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

const NONE: ReadonlySet<string> = new Set();
/** A failed write still refreshes the boards, which runs the scheduler again, so a write is retried only after the next wake. */
const tried = new Set<string>();
const once = (key: string) => !tried.has(key) && Boolean(tried.add(key));

/**
 * The ids of the Chrome calls in their starting window, the only app v1 records. Reading it notifies
 * due calls, marks every call this PC holds takes for, removes finished calls never recorded, and
 * sets the next wake.
 */
export const startingCallsAtom = Atom.make((get): ReadonlySet<string> => {
  const snapshot = get(recorderAtom);
  if (calls === undefined || snapshot === null) return NONE;
  const list = get(boardCallsAtom);
  const now = Date.now();
  get.addFinalizer(
    calls.onWake(() => {
      tried.clear();
      get.refreshSelf();
    }),
  );
  calls.wakeAt(nextWake(list, now));
  const chrome = list.filter(
    (call) =>
      call.app === "chrome" && (call.listed.board.cardStates?.[call.id] ?? "todo") === "todo",
  );
  void notifyDue(chrome, now);
  const split = splitHere(list, now, snapshot);
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
  return new Set(chrome.filter((call) => isStarting(call, now)).map((call) => call.id));
}).pipe(Atom.withLabel("starting-calls"));

/** What the board asks before it records: the consent notice, or that another call records. */
export const callPromptAtom = Atom.make<{
  readonly kind: "consent" | "busy";
  readonly request: RecordRequest;
} | null>(null).pipe(Atom.keepAlive, Atom.withLabel("call-prompt"));

/** The one start path, for a card's Record and a toast's. */
export async function recordCall(registry: AtomRegistry.AtomRegistry, request: RecordRequest) {
  const status = registry.get(recorderAtom)?.state.status ?? "idle";
  if (status !== "idle") return registry.set(callPromptAtom, { kind: "busy", request });
  if (!(await localState.read()).recordingConsent) {
    return registry.set(callPromptAtom, { kind: "consent", request });
  }
  recorder?.start(request);
}

/** Opens the board of a toast whose Record was pressed, then records its call. */
export const toastRecordAtom = Atom.make((get) => {
  if (calls === undefined || get(recorderAtom) === null) return;
  const take = () =>
    void calls.takeRecord().then((toast) => {
      if (toast === null) return;
      void openBoard(get.registry, { projectId: toast.projectId, folder: toast.folder });
      void recordCall(get.registry, toast.request);
    });
  get.addFinalizer(calls.onRecord(take));
  take();
}).pipe(Atom.withLabel("toast-record"));

export const acceptConsent = () =>
  localState.update((state) => ({ ...state, recordingConsent: true }));

export const stopRecording = () => recorder?.stop();
export const openRecordingFile = (file: RecordingFile) =>
  recorder?.openFile(file) ?? Promise.resolve("missing" as const);
export const deleteAudio = (callId: string) =>
  recorder?.deleteAudio(callId) ?? Promise.resolve(false);

/** Relative to the board folder. */
export const transcriptPath = (callId: string) => `artifacts/calls/${callId}/transcript.md`;

type Transcription =
  | { readonly status: "running"; readonly done: number; readonly total: number }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "written" };

/** By call id, on this PC only. */
export const transcriptionsAtom = Atom.make<Readonly<Record<string, Transcription>>>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("call-transcriptions"),
);

const isInvalidRequest = Schema.is(EnvironmentRequestInvalidError);
const isUndeclaredStatus = Schema.is(RemoteEnvironmentAuthUndeclaredStatusError);

/** The engine's errors in plain words. A missing model comes back as a generic invalid command. */
function failure(cause: unknown, missingModel: string) {
  if (isInvalidRequest(cause) && cause.reason === "invalid_command") return missingModel;
  if (isInvalidRequest(cause) && cause.reason === "speech_busy") {
    return "Another speech task is running on the engine. Try again when it finishes.";
  }
  if (isUndeclaredStatus(cause) && cause.status === 503) {
    return "The engine stopped. Transcribe again once it is back.";
  }
  return cause instanceof Error ? cause.message : String(cause);
}

type NotesRequest =
  | { readonly status: "sending" | "sent" }
  | { readonly status: "failed"; readonly message: string };

/** By call id, on this PC only. The notes card itself comes from `notes.json`. */
export const callNotesRequestsAtom = Atom.make<Readonly<Record<string, NotesRequest>>>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("call-notes-requests"),
);

/** Asks the orchestrator to start a `call-notes` agent on the call's transcript. */
export async function requestCallNotes(
  registry: AtomRegistry.AtomRegistry,
  project: Pick<EnvironmentProject, "environmentId" | "workspaceRoot">,
  listed: ValidBoard,
  call: Pick<CallEvent, "id" | "title">,
) {
  const set = (request: NotesRequest) =>
    registry.update(callNotesRequestsAtom, (all) => ({ ...all, [call.id]: request }));
  const threadId = listed.board.orchestratorThreadId;
  if (threadId === null) {
    return set({
      status: "failed",
      message: "Start this board's orchestrator, then press Write call notes.",
    });
  }
  set({ status: "sending" });
  const dir = `${project.workspaceRoot}/${BOARDS_DIR}/${listed.folder}`;
  const failure = await messageOrchestrator(registry, project.environmentId, threadId, async () =>
    callNotesMessage({
      callId: call.id,
      title: call.title,
      transcript: `${dir}/${transcriptPath(call.id)}`,
      notes: `${dir}/${callNotesPath(call.id)}`,
    }),
  ).catch((cause: unknown) => (cause instanceof Error ? cause.message : String(cause)));
  set(failure === null ? { status: "sent" } : { status: "failed", message: failure });
}

/**
 * Uses the engine's selected speech model. A failure keeps the audio and shows on the call. Once
 * the transcript is written it asks for the call's notes.
 */
export async function transcribeCall(
  registry: AtomRegistry.AtomRegistry,
  project: Pick<EnvironmentProject, "environmentId" | "workspaceRoot">,
  listed: ValidBoard,
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
  let missingModel = "Choose a speech model in T3's voice settings, then transcribe again.";
  try {
    const speech = <A, E>(
      effect: Effect.Effect<A, E, HttpClient.HttpClient | EnvironmentRegistry.EnvironmentRegistry>,
    ) =>
      Effect.runPromise(
        AtomRegistry.getResult(registry, connectionAtomRuntime).pipe(
          Effect.flatMap((context) => Effect.provide(effect, context)),
        ),
      );
    // Read from the supervisor itself, since the session's atom is empty until a view mounts it.
    const prepared = Option.getOrNull(
      await speech(
        EnvironmentRegistry.EnvironmentRegistry.pipe(
          Effect.flatMap((environments) =>
            environments.run(
              project.environmentId,
              EnvironmentSupervisor.EnvironmentSupervisor.pipe(
                Effect.flatMap((supervisor) => SubscriptionRef.get(supervisor.prepared)),
              ),
            ),
          ),
        ),
      ),
    );
    if (prepared === null) throw new Error("The engine is not connected.");
    const status = await speech(getEnvironmentSpeechStatus(prepared));
    if (!status.supported) throw new Error(status.reason);
    missingModel = `Install ${status.model} in T3's voice settings, then transcribe again.`;
    if (status.state === "missing-model") throw new Error(missingModel);
    await transcribeTakes({
      takes,
      read: recorder.readTrack,
      transcribe: async (pcm) =>
        (
          await speech(
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
          `${BOARDS_DIR}/${listed.folder}/${transcriptPath(callId)}`,
          markdown,
        ),
      deleteAudio: async () => sameTakes(takes, takesOf()) && recorder.deleteAudio(callId),
      progress: (done, total) => set({ status: "running", done, total }),
    });
    set({ status: "written" });
    void requestCallNotes(registry, project, listed, { id: callId, title: first.title });
  } catch (cause) {
    set({ status: "failed", message: failure(cause, missingModel) });
  }
}
