import { Atom } from "effect/reactivity";

import type { RecorderHost, RecorderSnapshot, RecordRequest } from "../connection/engineState";
import { localState } from "./boards";

/** Undefined in `dev:web`, which has no main process to record with. */
const host = (): RecorderHost | undefined => window.board?.recorder;

export const recorderAtom = Atom.make((get): RecorderSnapshot | null => {
  const recorder = host();
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

/** Starts recording once consent is saved. False when the notice has to ask first. */
export async function record(request: RecordRequest): Promise<boolean> {
  if (!(await localState.read()).recordingConsent) return false;
  host()?.start(request);
  return true;
}

export const acceptConsent = () =>
  localState.update((state) => ({ ...state, recordingConsent: true }));

export const stopRecording = () => host()?.stop();
export const deleteAudio = (callId: string) => host()?.deleteAudio(callId);
