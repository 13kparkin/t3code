import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import { parseBoard } from "../domain/board";
import { archiveBoard, type BoardThreads, type FamilyThread, restoreBoard } from "./boardArchive";
import {
  changeHiddenAdditions,
  createBoard,
  listBoards,
  type ProjectFiles,
  refreshRoles,
  setBuilderCap,
  sha256,
  updateBoard,
} from "./boardFiles";
import { roleFiles } from "../orchestrator/roles";

const CWD = "/work/project";
const PROJECT_ID = "586df7d0-cfc5-44b8-957a-ae03fb872e67";

/** The engine's project files: a map from project-relative path to text. */
function fakeFiles(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const files: ProjectFiles = {
    list: async (_cwd, directory) => {
      const prefix = `${directory}/`;
      const children = new Map<string, string>();
      for (const path of store.keys()) {
        if (!path.startsWith(prefix)) continue;
        const [name, ...rest] = path.slice(prefix.length).split("/");
        children.set(`${prefix}${name}`, rest.length > 0 ? "directory" : "file");
      }
      return children.size === 0 ? null : [...children].map(([path, kind]) => ({ path, kind }));
    },
    read: async (_cwd, path) => store.get(path) ?? null,
    write: async (_cwd, path, contents) => void store.set(path, contents),
  };
  return { files, store };
}

let nextId = 0;
const input = (name: string) => ({
  id: `board-${(nextId += 1)}`,
  projectId: PROJECT_ID,
  name,
  createdAt: "2026-11-20T06:00:00.000Z",
});

describe("boards in a project", () => {
  it("Given an empty project, when a board is created, then board.json and the ignore file are written", async () => {
    const { files, store } = fakeFiles();
    const created = await createBoard(files, CWD, input("Claude connector"));
    expect(created.folder).toBe("claude-connector");
    expect(store.get(".agentboard/.gitignore")).toBe("*\n");
    const parsed = parseBoard(store.get(".agentboard/claude-connector/board.json") ?? "");
    expect(Result.isSuccess(parsed) && parsed.success.archived).toBe(false);
    expect(store.get(".agentboard/claude-connector/smoke.md")).toBe("");
  });

  it("Given role copies in each state, when the boards are listed, then a stale unchanged copy is refreshed, an edited copy is kept, a missing copy is written, and a second listing writes nothing", async () => {
    const { files, store } = fakeFiles();
    const created = await createBoard(files, CWD, input("Claude connector"));
    const roles = `.agentboard/${created.folder}/roles`;
    await listBoards(files, CWD, true);
    const reviewer = roleFiles.get("reviewer.md") ?? "";
    expect(store.get(`${roles}/reviewer.md`)).toBe(reviewer);

    const manifest = JSON.parse(store.get(`${roles}/.app-written.json`) ?? "{}");
    const oldTask = "old task role";
    store.set(`${roles}/task.md`, oldTask);
    manifest["task.md"] = await sha256(oldTask);
    store.set(`${roles}/.app-written.json`, JSON.stringify(manifest));
    store.set(`${roles}/reviewer.md`, "my reviewer edits");
    store.delete(`${roles}/scout.md`);
    await listBoards(files, CWD, true);
    expect(store.get(`${roles}/task.md`)).toBe(roleFiles.get("task.md"));
    expect(store.get(`${roles}/reviewer.md`)).toBe("my reviewer edits");
    expect(store.get(`${roles}/scout.md`)).toBe(roleFiles.get("scout.md"));

    const writes: string[] = [];
    await listBoards({ ...files, write: async (_c, p) => void writes.push(p) }, CWD, true);
    expect(writes).toEqual([]);
  });

  it("Given a new board whose orchestrator is launching, when the boards are listed at the same time, then each role file is written once", async () => {
    const { files } = fakeFiles();
    const created = await createBoard(files, CWD, input("Claude connector"));
    const writes: string[] = [];
    const counted = {
      ...files,
      write: async (c: string, p: string, t: string) => (writes.push(p), files.write(c, p, t)),
    };
    await Promise.all([refreshRoles(counted, CWD, created.folder), listBoards(counted, CWD, true)]);
    const roleWrites = writes.filter((path) => path.endsWith(".md"));
    expect(roleWrites).toHaveLength(roleFiles.size);
  });

  it("Given a dev build, when a board in a project outside the dev state is listed, then nothing is written into its .agentboard", async () => {
    const { files, store } = fakeFiles();
    const created = await createBoard(files, CWD, input("Claude connector"));
    store.delete(`.agentboard/${created.folder}/gates.md`);
    const writes: string[] = [];
    await listBoards({ ...files, write: async (_c, p) => void writes.push(p) }, CWD, false);
    expect(writes).toEqual([]);
  });

  it("Given a board with no usable record of written roles, when the boards are listed, then copies matching the app are recorded without a rewrite and a differing copy is kept", async () => {
    const { files, store } = fakeFiles();
    const created = await createBoard(files, CWD, input("Claude connector"));
    const roles = `.agentboard/${created.folder}/roles`;
    store.set(`${roles}/.app-written.json`, "null");
    for (const [name, text] of roleFiles) store.set(`${roles}/${name}`, text);
    store.set(`${roles}/task.md`, "older task role");
    const writes: string[] = [];
    await listBoards(
      { ...files, write: async (_c, p, t) => (writes.push(p), files.write(_c, p, t)) },
      CWD,
      true,
    );
    expect(writes).toEqual([`${roles}/.app-written.json`]);
    const recorded = JSON.parse(store.get(`${roles}/.app-written.json`) ?? "{}");
    expect(recorded["reviewer.md"]).toBe(await sha256(roleFiles.get("reviewer.md") ?? ""));
    expect(recorded["task.md"]).toBeUndefined();
    expect(store.get(`${roles}/task.md`)).toBe("older task role");
  });

  it("Given a new board, when it is created, then the five store files exist, and listing an older board fills in only the missing ones", async () => {
    const { files, store } = fakeFiles();
    const created = await createBoard(files, CWD, input("Claude connector"));
    const dir = `.agentboard/${created.folder}`;
    expect(store.get(`${dir}/tickets.json`)).toBe("[]");
    for (const name of ["foryou.jsonl", "decisions.tsv", "preferences.md", "gates.md"]) {
      expect(store.get(`${dir}/${name}`)).toBe("");
    }
    store.delete(`${dir}/gates.md`);
    store.set(`${dir}/tickets.json`, '[{"key":"T-1"}]');
    await listBoards(files, CWD, true);
    await listBoards(files, CWD, true);
    expect(store.get(`${dir}/gates.md`)).toBe("");
    expect(store.get(`${dir}/tickets.json`)).toBe('[{"key":"T-1"}]');
  });

  it("Given a board with the same name, when a second is created, then its folder is claude-connector-2", async () => {
    const { files, store } = fakeFiles();
    await createBoard(files, CWD, input("Claude connector"));
    const second = await createBoard(files, CWD, input("Claude connector"));
    expect(second.folder).toBe("claude-connector-2");
    expect(store.has(".agentboard/claude-connector-2/board.json")).toBe(true);
  });

  it("Given a folder with a broken board.json, when boards are listed, then it comes back with the bad field", async () => {
    const { files, store } = fakeFiles();
    await createBoard(files, CWD, input("Good one"));
    store.set(".agentboard/broken/board.json", JSON.stringify({ slug: "broken" }));
    const listed = await listBoards(files, CWD, true);
    expect(listed.map((board) => [board.folder, board.ok])).toEqual([
      ["broken", false],
      ["good-one", true],
    ]);
    const broken = listed[0];
    expect(!broken?.ok && broken?.issue.fields).toContain("name");
  });

  it("Given no .agentboard folder, when boards are listed, then there are none", async () => {
    expect(await listBoards(fakeFiles().files, CWD, true)).toEqual([]);
  });
});

interface FakeThread extends Omit<FamilyThread, "working"> {
  working: boolean;
  archived: boolean;
}

/** The engine's threads. A stop takes effect after `stopPolls` reads, as it does on the real engine. */
function fakeThreads(threads: FakeThread[], stopPolls = 0) {
  const calls: string[] = [];
  let pendingPolls = -1;
  const threadsApi: BoardThreads = {
    stop: async (id) => {
      calls.push(`stop ${id}`);
      pendingPolls = stopPolls;
    },
    activeFamily: async () => {
      if (pendingPolls === 0) for (const thread of threads) thread.working = false;
      if (pendingPolls > 0) pendingPolls -= 1;
      return threads.filter((thread) => !thread.archived);
    },
    archivedFamily: async () => threads.filter((thread) => thread.archived),
    archive: async (id) => {
      const thread = threads.find((candidate) => candidate.id === id);
      if (thread?.working) throw new Error(`${id} has running delegated tasks`);
      calls.push(`archive ${id}`);
      if (thread) thread.archived = true;
    },
    unarchive: async (id) => {
      calls.push(`unarchive ${id}`);
      const thread = threads.find((candidate) => candidate.id === id);
      if (thread) thread.archived = false;
    },
  };
  return { threadsApi, calls };
}

const family = (): FakeThread[] => [
  { id: "child", working: true, isRoot: false, archived: false },
  { id: "orchestrator", working: false, isRoot: true, archived: false },
];

const boardWith = async (orchestratorThreadId: string | null) => {
  const { files, store } = fakeFiles();
  const created = await createBoard(files, CWD, input("Claude connector"));
  const board = { ...created.board, orchestratorThreadId };
  store.set(".agentboard/claude-connector/board.json", JSON.stringify(board));
  return { files, store, target: { cwd: CWD, folder: created.folder, board } };
};

const archivedFlag = (store: Map<string, string>) => {
  const parsed = parseBoard(store.get(".agentboard/claude-connector/board.json") ?? "");
  return Result.isSuccess(parsed) ? parsed.success.archived : undefined;
};

const noSleep = { sleep: async () => undefined };

const savedBoard = (store: Map<string, string>) => {
  const parsed = parseBoard(store.get(".agentboard/claude-connector/board.json") ?? "");
  return Result.isSuccess(parsed) ? parsed.success : undefined;
};

describe("saving the builder cap", () => {
  it("Given a board with docs and an orchestrator, when the cap is saved, then only the cap changes", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    const docs = [{ name: "spec.md", sentAt: "2026-11-20T06:00:00.000Z" }];
    store.set(".agentboard/claude-connector/board.json", JSON.stringify({ ...target.board, docs }));
    await setBuilderCap(files, CWD, target.folder, 5);
    expect(savedBoard(store)).toMatchObject({
      builderCap: 5,
      orchestratorThreadId: "orchestrator",
      docs,
    });
  });

  it("Given a saved cap, when a review template is set and then cleared, then the cap stays and the key is removed", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    await setBuilderCap(files, CWD, target.folder, 5);
    await updateBoard(files, CWD, target.folder, { reviewTemplate: "Strict" });
    expect(savedBoard(store)).toMatchObject({ builderCap: 5, reviewTemplate: "Strict" });
    await updateBoard(files, CWD, target.folder, { reviewTemplate: undefined });
    expect(savedBoard(store)).toMatchObject({
      builderCap: 5,
      orchestratorThreadId: "orchestrator",
    });
    expect(store.get(".agentboard/claude-connector/board.json")).not.toContain("reviewTemplate");
  });

  it("Given a cap saved after the board was listed, when the stale board is archived and restored, then the cap stays", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    const { threadsApi } = fakeThreads([
      { id: "orchestrator", working: false, isRoot: true, archived: false },
    ]);
    await setBuilderCap(files, CWD, target.folder, 5);
    await archiveBoard(files, threadsApi, target, noSleep);
    expect(savedBoard(store)).toMatchObject({ archived: true, builderCap: 5 });
    await restoreBoard(files, threadsApi, target);
    expect(savedBoard(store)).toMatchObject({ archived: false, builderCap: 5 });
  });
});

describe("archiving a board", () => {
  it("Given a board with no orchestrator, when archived and restored, then only the board file changes", async () => {
    const { files, store, target } = await boardWith(null);
    const { threadsApi, calls } = fakeThreads([]);
    await archiveBoard(files, threadsApi, target, noSleep);
    expect(archivedFlag(store)).toBe(true);
    await restoreBoard(files, threadsApi, target);
    expect(archivedFlag(store)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("Given a running child, when the board is archived, then the stop comes first and the children are archived before the orchestrator", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    const { threadsApi, calls } = fakeThreads(family(), 2);
    await archiveBoard(files, threadsApi, target, noSleep);
    expect(calls).toEqual(["stop orchestrator", "archive child", "archive orchestrator"]);
    expect(archivedFlag(store)).toBe(true);
  });

  it("Given agents that never stop, when the board is archived, then it fails and the board stays unarchived", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    const { threadsApi, calls } = fakeThreads(family(), Number.POSITIVE_INFINITY);
    await expect(
      archiveBoard(files, threadsApi, target, { ...noSleep, stopTimeoutMs: 1_000 }),
    ).rejects.toThrow("still running");
    expect(calls).toEqual(["stop orchestrator"]);
    expect(archivedFlag(store)).toBe(false);
  });

  it("Given an archived board, when it is restored, then every family thread is unarchived and the file is cleared", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    const threads = family();
    const { threadsApi, calls } = fakeThreads(threads);
    await archiveBoard(files, threadsApi, target, noSleep);
    calls.length = 0;
    await restoreBoard(files, threadsApi, {
      ...target,
      board: { ...target.board, archived: true },
    });
    expect(calls).toEqual(["unarchive orchestrator", "unarchive child"]);
    expect(threads.every((thread) => !thread.archived)).toBe(true);
    expect(archivedFlag(store)).toBe(false);
  });

  it("Given an archive that stopped part way, when it is run again, then it finishes", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    const threads = family();
    const { threadsApi } = fakeThreads(threads);
    for (const thread of threads) thread.archived = true;
    await archiveBoard(files, threadsApi, target, noSleep);
    expect(archivedFlag(store)).toBe(true);
  });
});

describe("hiding additions", () => {
  it("Given two hides started together, when both are saved, then both ids stay hidden", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    await Promise.all([
      changeHiddenAdditions(files, CWD, target.folder, (ids) => [...ids, "a"]),
      changeHiddenAdditions(files, CWD, target.folder, (ids) => [...ids, "b"]),
    ]);
    expect(savedBoard(store)).toMatchObject({ hiddenAdditions: ["a", "b"] });
  });

  it("Given the same id hidden twice, when both are saved, then it is listed once", async () => {
    const { files, store, target } = await boardWith("orchestrator");
    await changeHiddenAdditions(files, CWD, target.folder, (ids) => [...ids, "a"]);
    await changeHiddenAdditions(files, CWD, target.folder, (ids) => [...ids, "a"]);
    expect(savedBoard(store)).toMatchObject({ hiddenAdditions: ["a"] });
  });
});
