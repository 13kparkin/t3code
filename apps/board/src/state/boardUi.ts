import { Atom, type AtomRegistry } from "effect/reactivity";

import type { FrameOrder } from "../board/layout";
import type { FileBox, LocalState } from "../store/localState";
import { localState } from "./boards";

/** The order the user dragged each lane's frames to, by board id then lane. The saved order replaces the empty one on launch. */
export const frameOrderAtom = Atom.writable(
  (get): Readonly<Record<string, FrameOrder>> => {
    void localState.read().then((state) => get.setSelf(state.frameOrder));
    return {};
  },
  (context, next: Readonly<Record<string, FrameOrder>>) => context.setSelf(next),
).pipe(Atom.keepAlive, Atom.withLabel("frame-order"));

export function saveFrameOrder(
  registry: AtomRegistry.AtomRegistry,
  boardId: string,
  lane: string,
  keys: ReadonlyArray<string>,
) {
  const change = (all: Readonly<Record<string, FrameOrder>>) => ({
    ...all,
    [boardId]: { ...all[boardId], [lane]: keys },
  });
  registry.set(frameOrderAtom, change(registry.get(frameOrderAtom)));
  return localState.update((state) => ({ ...state, frameOrder: change(state.frameOrder) }));
}

/** A canvas filter flipped from its default on one board, or a ticket section collapsed on every ticket. */
export type FoldKey = `lane:${string}:${string}` | `sec:${string}`;
export const laneKey = (boardId: string, lane: string): FoldKey => `lane:${boardId}:${lane}`;
export const sectionKey = (id: string): FoldKey => `sec:${id}`;

/** Canvas filters flipped from their default, and ticket sections folded away. Defaults hold until the saved set arrives. */
export const foldedAtom = Atom.writable(
  (get): ReadonlySet<string> => {
    void localState.read().then((state) => get.setSelf(new Set(state.folded)));
    return new Set();
  },
  (context, next: ReadonlySet<string>) => context.setSelf(next),
).pipe(Atom.keepAlive, Atom.withLabel("folded"));

export function setFolded(registry: AtomRegistry.AtomRegistry, key: FoldKey, folded: boolean) {
  const change = (keys: Iterable<string>) => {
    const next = new Set(keys);
    if (folded) next.add(key);
    else next.delete(key);
    return next;
  };
  registry.set(foldedAtom, change(registry.get(foldedAtom)));
  return localState.update((state) => ({ ...state, folded: [...change(state.folded)] }));
}

export const toggleFolded = (registry: AtomRegistry.AtomRegistry, key: FoldKey) =>
  setFolded(registry, key, !registry.get(foldedAtom).has(key));

/** One board's flipped filter ids, joined, so a section fold does not reach the canvas. */
export const filterFlipsAtom = Atom.family((boardId: string) =>
  Atom.make((get) => {
    const prefix = `lane:${boardId}:`;
    return [...get(foldedAtom)]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .sort()
      .join(",");
  }).pipe(Atom.withLabel(`filter-flips:${boardId}`)),
);

type FileBoxes = LocalState["fileBoxes"];

/** The Artifacts area and the files sections of every board: where each sits, its size, and whether it is open. */
export const fileBoxesAtom = Atom.writable(
  (get): FileBoxes => {
    void localState.read().then((state) => get.setSelf(state.fileBoxes));
    return {};
  },
  (context, next: FileBoxes) => context.setSelf(next),
).pipe(Atom.keepAlive, Atom.withLabel("file-boxes"));

/** Changes one box of one board, from what is saved or `fallback`, in the atom and in `local-state.json`. */
export function changeFileBox(
  registry: AtomRegistry.AtomRegistry,
  boardId: string,
  key: string,
  fallback: FileBox,
  change: (box: FileBox) => FileBox,
) {
  const apply = (all: FileBoxes) => ({
    ...all,
    [boardId]: { ...all[boardId], [key]: change(all[boardId]?.[key] ?? fallback) },
  });
  registry.set(fileBoxesAtom, apply(registry.get(fileBoxesAtom)));
  return localState.update((state) => ({ ...state, fileBoxes: apply(state.fileBoxes) }));
}
