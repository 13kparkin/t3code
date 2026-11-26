import { describe, expect, it } from "vite-plus/test";

import { createLocalState, EMPTY_LOCAL_STATE } from "./localState";

/** The file in the user data folder. */
function fakeStorage(initial = "") {
  const file = { text: initial };
  return {
    file,
    storage: {
      read: async () => file.text,
      write: async (text: string) => {
        file.text = text;
      },
    },
  };
}

describe("local state", () => {
  it("Given no file, when read, then it is empty", async () => {
    expect(await createLocalState(fakeStorage().storage).read()).toEqual(EMPTY_LOCAL_STATE);
  });

  it("Given a file saved before frames could move, when read, then the last board is kept and no frame is moved", async () => {
    const saved = JSON.stringify({
      lastOpenedBoard: { projectId: "p1", folder: "a" },
      cardPositions: {},
    });
    expect(await createLocalState(fakeStorage(saved).storage).read()).toEqual({
      ...EMPTY_LOCAL_STATE,
      lastOpenedBoard: { projectId: "p1", folder: "a" },
    });
  });

  it("Given a file saved before file boxes could move, when read, then none is placed; a saved box keeps only what was set", async () => {
    expect((await createLocalState(fakeStorage("{}").storage).read()).fileBoxes).toEqual({});
    const { storage } = fakeStorage();
    const boxes = {
      b1: {
        artifacts: { x: 40, y: -12 },
        c1: { x: 300, y: 0, width: 288, height: 200, open: true },
      },
    };
    await createLocalState(storage).update((state) => ({ ...state, fileBoxes: boxes }));
    expect((await createLocalState(storage).read()).fileBoxes).toEqual(boxes);
  });

  it("Given a file saved before the chat thread could hide, when read, then no board has it shown; a saved choice is kept", async () => {
    expect((await createLocalState(fakeStorage("{}").storage).read()).threadShown).toEqual({});
    const { storage } = fakeStorage();
    await createLocalState(storage).update((state) => ({ ...state, threadShown: { b1: true } }));
    expect((await createLocalState(storage).read()).threadShown).toEqual({ b1: true });
  });

  it("Given a last opened board, when the app reads again, then it is still there", async () => {
    const { storage } = fakeStorage();
    await createLocalState(storage).update((state) => ({
      ...state,
      lastOpenedBoard: { projectId: "p1", folder: "claude-connector" },
    }));
    expect((await createLocalState(storage).read()).lastOpenedBoard).toEqual({
      projectId: "p1",
      folder: "claude-connector",
    });
  });

  it("Given a saved file with one custom template, when read, then the template decodes to its literal value", async () => {
    const saved = JSON.stringify({
      lastOpenedBoard: null,
      reviewTemplates: [
        {
          name: "Security only",
          authorChecks: ["simplify"],
          lanes: [{ skill: "security-audit", runsWhen: "on every ticket" }],
        },
      ],
    });
    expect((await createLocalState(fakeStorage(saved).storage).read()).reviewTemplates).toEqual([
      {
        name: "Security only",
        authorChecks: ["simplify"],
        lanes: [{ skill: "security-audit", runsWhen: "on every ticket" }],
      },
    ]);
  });

  it("Given two updates at once, when both finish, then both changes are kept", async () => {
    const local = createLocalState(fakeStorage().storage);
    await Promise.all([
      local.update((state) => ({
        ...state,
        lastOpenedBoard: { projectId: "p1", folder: "a" },
      })),
      local.update((state) => ({
        ...state,
        frameOrder: { ...state.frameOrder, b1: { building: ["T-2", "T-1"] } },
      })),
      local.update((state) => ({ ...state, folded: [...state.folded, "sec:steps"] })),
    ]);
    const state = await local.read();
    expect(state.folded).toEqual(["sec:steps"]);
    expect(state.lastOpenedBoard?.folder).toBe("a");
    expect(state.frameOrder["b1"]?.["building"]).toEqual(["T-2", "T-1"]);
  });
});
