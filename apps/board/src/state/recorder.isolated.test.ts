import { describe, expect, it, vi } from "vite-plus/test";
import { AtomRegistry } from "effect/reactivity";

const mocks = vi.hoisted(() => {
  const start = vi.fn();
  Object.assign(globalThis, {
    window: {
      board: {
        recorder: {
          start,
          snapshot: () =>
            Promise.resolve({ state: { status: "idle", failed: null }, recordings: [] }),
          onSnapshot: () => () => {},
        },
      },
    },
  });
  return { start, saveCall: vi.fn(() => Promise.resolve(null)) };
});
vi.mock("./boardCards", () => ({
  saveCall: mocks.saveCall,
  deleteCall: vi.fn(),
  markRecorded: vi.fn(),
}));
vi.mock("./boards", () => ({
  localState: { read: () => Promise.resolve({ recordingConsent: true }) },
  newId: (() => {
    let n = 0;
    return () => `call-${++n}`;
  })(),
  boardEngine: vi.fn(),
  projectBoardsAtom: vi.fn(),
}));

import { recordNewCall } from "./recorder";

describe("Record a call pressed twice", () => {
  it("Given two presses before main says starting, then one call is saved", async () => {
    const registry = AtomRegistry.make();
    // SAFETY: saveCall is mocked, so recordNewCall reads only listed.board.id.
    const project = {} as never;
    // SAFETY: as above, only board.id is read.
    const listed = { board: { id: "b" } } as never;
    const report = vi.fn();
    await Promise.all([
      recordNewCall(registry, project, listed, report),
      recordNewCall(registry, project, listed, report),
    ]);
    expect(mocks.saveCall).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
