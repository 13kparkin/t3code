import { describe, expect, it, vi } from "vite-plus/test";
import { AtomRegistry } from "effect/reactivity";

import type { RecorderSnapshot } from "../connection/engineState";

const mocks = vi.hoisted(() => {
  const start = vi.fn();
  const listeners: Array<(snapshot: RecorderSnapshot) => void> = [];
  Object.assign(globalThis, {
    window: {
      board: {
        recorder: {
          start,
          snapshot: () =>
            Promise.resolve({ state: { status: "idle", failed: null }, recordings: [] }),
          onSnapshot: (listener: (snapshot: RecorderSnapshot) => void) => {
            listeners.push(listener);
            return () => {};
          },
        },
      },
    },
  });
  return { start, listeners, saveCall: vi.fn(() => Promise.resolve(null)) };
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
  it("Given presses before main says starting, then one call is saved", async () => {
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
    await recordNewCall(registry, project, listed, report);
    expect(mocks.saveCall).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    for (const listener of mocks.listeners) {
      listener({ state: { status: "idle", failed: null }, recordings: [] });
    }
    await recordNewCall(registry, project, listed, report);
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
});
