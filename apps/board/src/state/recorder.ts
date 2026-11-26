import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { dueCalls, isStarting, markNotified, nextWake, splitCalls } from "../calls/dueCalls";
import type { RecorderSnapshot } from "../connection/engineState";
import type { CallEvent } from "../domain/board";
import type { RecordRequest } from "../domain/recording";
import type { ValidBoard } from "../store/boardFiles";
import { deleteCall } from "./boardCards";
import { localState, openBoard, projectBoardsAtom } from "./boards";
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

const NONE: ReadonlySet<string> = new Set();
/** A failed removal still refreshes the boards, which runs the scheduler again, so each call is tried once a session. */
const removing = new Set<string>();

/**
 * The ids of the Chrome calls in their starting window, the only app v1 records. Reading it notifies
 * due calls, removes finished calls with nothing recorded, and sets the next wake.
 */
export const startingCallsAtom = Atom.make((get): ReadonlySet<string> => {
  const snapshot = get(recorderAtom);
  if (calls === undefined || snapshot === null) return NONE;
  const list = get(boardCallsAtom);
  const now = Date.now();
  get.addFinalizer(calls.onWake(() => get.refreshSelf()));
  calls.wakeAt(nextWake(list, now));
  const chrome = list.filter(
    (call) =>
      call.app === "chrome" && (call.listed.board.cardStates?.[call.id] ?? "todo") === "todo",
  );
  void notifyDue(chrome, now);
  const recording = snapshot.state.status === "idle" ? null : snapshot.state.callId;
  const recorded = new Set(snapshot.recordings.map((take) => take.callId));
  // A dev build's seeded projects point at the developer's live checkout, as in projectBoardsAtom.
  for (const call of import.meta.env.DEV ? [] : splitCalls(list, now, recording, recorded).stale) {
    if (removing.has(call.id)) continue;
    removing.add(call.id);
    void deleteCall(get.registry, call.project, call.listed, call.id);
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
export const deleteAudio = (callId: string) => recorder?.deleteAudio(callId);
