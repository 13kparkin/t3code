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
  const key = boardKey("/repo", "board");
  const board = createBoardStore(Atom.make<ProjectFiles | null>(files), active);
  const store = board.files(key);
  const registry = AtomRegistry.make();
  const unmount = registry.mount(board.poll(key));
  return {
    reads,
    active,
    store,
    registry,
    unmount,
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
  it("reads the tickets, decisions and For you files each tick while the app is active", async () => {
    using board = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(board.reads).toEqual([
      ".agentboard/board/tickets.json",
      ".agentboard/board/decisions.tsv",
      ".agentboard/board/foryou.jsonl",
    ]);
    await vi.advanceTimersByTimeAsync(STORE_POLL_MS);
    expect(board.reads).toHaveLength(6);
  });

  it("reads nothing while the app is in the background", async () => {
    using board = setup();
    await vi.advanceTimersByTimeAsync(0);
    board.reads.length = 0;
    board.registry.set(board.active, false);
    await vi.advanceTimersByTimeAsync(STORE_POLL_MS * 20);
    expect(board.reads).toEqual([]);
  });

  it("keeps the last files when a read fails and after polling stops", async () => {
    using board = setup();
    await vi.advanceTimersByTimeAsync(0);
    const loaded = { tickets: "[]", decisions: null, forYou: null };
    expect(board.registry.get(board.store)).toEqual(loaded);
    board.failReads();
    await vi.advanceTimersByTimeAsync(STORE_POLL_MS);
    expect(board.reads).toHaveLength(6);
    expect(board.registry.get(board.store)).toEqual(loaded);
    board.unmount();
    expect(board.registry.get(board.store)).toEqual(loaded);
  });
});
