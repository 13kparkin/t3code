import { Atom, type AtomRegistry } from "effect/reactivity";

import type { PickerValue } from "../domain/picker";
import { localState } from "./boards";

/** The default orchestrator model from Settings, or null for the built-in one. The saved value replaces null on launch. */
export const defaultOrchestratorAtom = Atom.writable(
  (get): PickerValue | null => {
    void localState.read().then((state) => get.setSelf(state.defaultOrchestrator));
    return null;
  },
  (context, next: PickerValue | null) => context.setSelf(next),
).pipe(Atom.keepAlive, Atom.withLabel("default-orchestrator"));

export function saveDefaultOrchestrator(
  registry: AtomRegistry.AtomRegistry,
  next: PickerValue | null,
) {
  registry.set(defaultOrchestratorAtom, next);
  return localState.update((state) => ({ ...state, defaultOrchestrator: next }));
}
