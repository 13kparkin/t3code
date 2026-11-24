import { Atom, type AtomRegistry } from "effect/reactivity";

import { showPanelTab, panelAtom, setPanelOpen } from "../browser/panel";
import { localState } from "./boards";

export const threadShownAtom = Atom.writable(
  (get): Readonly<Record<string, boolean>> => {
    void localState.read().then((state) => get.setSelf(state.threadShown));
    return {};
  },
  (context, next: Readonly<Record<string, boolean>>) => context.setSelf(next),
).pipe(Atom.keepAlive, Atom.withLabel("thread-shown"));

export const threadKey = (projectId: string, folder: string) => `${projectId}/${folder}`;

export function chatThreadVisible(registry: AtomRegistry.AtomRegistry): boolean {
  const { open, tab } = registry.get(panelAtom);
  return open && tab === "chat";
}

export function applyThreadShown(registry: AtomRegistry.AtomRegistry, shown: boolean) {
  if (shown) showPanelTab(registry, "chat");
  else if (chatThreadVisible(registry)) setPanelOpen(registry, false);
}

export function setThreadShown(registry: AtomRegistry.AtomRegistry, key: string, shown: boolean) {
  const next = { ...registry.get(threadShownAtom), [key]: shown };
  registry.set(threadShownAtom, next);
  applyThreadShown(registry, shown);
  return localState.update((state) => ({ ...state, threadShown: next }));
}
