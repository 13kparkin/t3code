import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { boardKey, createBoardStore, type ProjectFiles, STORE_POLL_MS } from "./boardAtoms";

function setup() {
  vi.useFakeTimers();
  const reads: Array<string> = [];
  let fail = false;
  const files: ProjectFiles = {
    list: async () => null,
    read: async (_cwd, path) => {
      reads.push(path);
      if (fail) throw new Error("Connection lost.");
      return path.endsWith("/tickets.json") ? "[]" : null;
    },
  };
  const active = Atom.make(true);
  const store = createBoardStore(
    Atom.make<ProjectFiles | null>(files),
    active,
  )(boardKey("/repo", "board"));
  const registry = AtomRegistry.make();
  const unmount = registry.mount(store);
  return {
    reads,
    active,
    store,
    registry,
    failReads: () => {
      fail = true;
    },
    [Symbol.dispose]: () => {
      unmount();
      vi.useRealTimers();
    },
  };
}

describe("createBoardStore", () => {
  it("reads the four store files each tick while the app is active", async () => {
    using board = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(board.reads).toEqual([
      ".agentboard/board/tickets.json",
      ".agentboard/board/foryou.jsonl",
      ".agentboard/board/decisions.tsv",
      ".agentboard/board/additions.json",
    ]);
    await vi.advanceTimersByTimeAsync(STORE_POLL_MS);
    expect(board.reads).toHaveLength(8);
  });

  it("reads nothing while the app is in the background", async () => {
    using board = setup();
    await vi.advanceTimersByTimeAsync(0);
    board.reads.length = 0;
    board.registry.set(board.active, false);
    await vi.advanceTimersByTimeAsync(STORE_POLL_MS * 20);
    expect(board.reads).toEqual([]);
  });

  it("keeps the last files when a read fails", async () => {
    using board = setup();
    await vi.advanceTimersByTimeAsync(0);
    const loaded = { tickets: "[]", forYou: null, decisions: null, additions: null };
    expect(board.registry.get(board.store)).toEqual(loaded);
    board.failReads();
    await vi.advanceTimersByTimeAsync(STORE_POLL_MS);
    expect(board.reads).toHaveLength(8);
    expect(board.registry.get(board.store)).toEqual(loaded);
  });
});
