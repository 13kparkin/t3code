import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "../domain/ticket";
import type { ProjectFiles } from "./boardFiles";
import {
  type CleanupPorts,
  cleanupMerged,
  type LiveThread,
  evidenceOnBoardWorktrees,
  planCleanup,
  readBoardTickets,
  runOnePerKey,
  type WorktreeFacts,
  type WorktreeStatus,
} from "./mergeCleanup";

const ROOT = "/repo";
const WT = "/wt/t3-2cc5f690";
const OTHER = "/wt/t3-reviewer";

const ticket = (patch: Partial<Ticket> = {}): Ticket => ({
  key: "T-26",
  title: "Launch test cap wording",
  stage: "merged",
  worktreePath: WT,
  threads: [{ threadId: "builder", role: "task" }],
  ...patch,
});

const clean: WorktreeStatus = {
  isRepo: true,
  hasWorkingTreeChanges: false,
  refName: "fix/board-launch-test-cap-wording",
  hasUpstream: true,
  aheadCount: 0,
  aheadOfDefaultCount: 0,
};

const facts = (patch: Partial<WorktreeFacts> = {}): WorktreeFacts => ({
  ticket: ticket(),
  path: WT,
  workspaceRoot: ROOT,
  projectTickets: [ticket()],
  listed: [OTHER, WT],
  threads: [{ id: "builder", worktreePath: WT, working: false, isRoot: false }],
  status: clean,
  evidenceOnBoard: true,
  ...patch,
});

describe("planCleanup", () => {
  it.each<[string, Partial<WorktreeFacts>, ReturnType<typeof planCleanup>]>([
    ["SAFE: T-26 merged, clean, pushed, evidence on the board", {}, { kind: "remove", path: WT }],
    [
      "this session's migration did not report the worktree migrated",
      { evidenceOnBoard: false },
      { kind: "keep", reason: "evidence-missing" },
    ],
    [
      "SAFE after GitHub deleted the merged branch and a fetch pruned it",
      { status: { ...clean, hasUpstream: false, aheadCount: 0, aheadOfDefaultCount: 0 } },
      { kind: "remove", path: WT },
    ],
    [
      "squash-merged branch with its upstream pruned",
      { status: { ...clean, hasUpstream: false, aheadCount: 1, aheadOfDefaultCount: 1 } },
      { kind: "keep", reason: "unpushed" },
    ],
    [
      "ASK t3-9dff628b: 2 commits not in main, already pushed to origin",
      { status: { ...clean, hasUpstream: true, aheadCount: 0, aheadOfDefaultCount: 2 } },
      { kind: "remove", path: WT },
    ],
    [
      "a commit not pushed to its upstream and not in main",
      { status: { ...clean, hasUpstream: true, aheadCount: 1, aheadOfDefaultCount: 1 } },
      { kind: "keep", reason: "unpushed" },
    ],
    [
      "the worktree detached after git listed it, with a commit no ref holds",
      { status: { ...clean, refName: null, hasUpstream: false, aheadCount: 0 } },
      { kind: "keep", reason: "unpushed" },
    ],
    [
      "ASK T-2: one untracked file",
      { status: { ...clean, hasWorkingTreeChanges: true } },
      { kind: "keep", reason: "dirty" },
    ],
    [
      "KEEP T-39: another open ticket builds in the same worktree",
      { projectTickets: [ticket(), ticket({ key: "T-39", stage: "building" })] },
      { kind: "keep", reason: "shared" },
    ],
    [
      "an off-path ticket on the same worktree does not hold it",
      { projectTickets: [ticket(), ticket({ key: "T-59", stage: "off_path" })] },
      { kind: "remove", path: WT },
    ],
    [
      "a live thread outside the ticket uses the worktree",
      {
        threads: [
          { id: "builder", worktreePath: WT, working: false, isRoot: false },
          { id: "other", worktreePath: `${WT}/`, working: false, isRoot: false },
        ],
      },
      { kind: "keep", reason: "shared" },
    ],
    [
      "KEEP T-56: the ticket's agent still runs",
      { threads: [{ id: "builder", worktreePath: WT, working: true, isRoot: false }] },
      { kind: "keep", reason: "running" },
    ],
    [
      "KEEP T-19: running with 11 uncommitted files",
      {
        threads: [{ id: "builder", worktreePath: WT, working: true, isRoot: false }],
        status: { ...clean, hasWorkingTreeChanges: true },
      },
      { kind: "keep", reason: "running" },
    ],
    [
      "a board's tickets.json did not read",
      { projectTickets: null },
      { kind: "keep", reason: "store-unreadable" },
    ],
    [
      "the engine's threads have not loaded",
      { threads: null },
      { kind: "keep", reason: "threads-unknown" },
    ],
    ["git status did not answer", { status: null }, { kind: "keep", reason: "status-unknown" }],
    [
      "T-59 is off path, not merged",
      { ticket: ticket({ stage: "off_path" }) },
      { kind: "keep", reason: "not-merged" },
    ],
    [
      "the path is the main checkout",
      { path: `${ROOT}/` },
      { kind: "keep", reason: "main-checkout" },
    ],
    ["the path is relative", { path: "../wt" }, { kind: "keep", reason: "relative-path" }],
    [
      "the path names a listed worktree another way, so git could resolve a different folder",
      { path: `${WT}/.` },
      { kind: "keep", reason: "unlisted" },
    ],
    ["git's worktree list did not read", { listed: null }, { kind: "keep", reason: "unlisted" }],
    [
      "the worktree was deleted and git no longer lists it",
      { listed: [OTHER], status: { ...clean, isRepo: false } },
      { kind: "gone" },
    ],
    ["the worktree is already gone", { status: { ...clean, isRepo: false } }, { kind: "gone" }],
  ])("%s", (_name, patch, expected) => {
    expect(planCleanup(facts(patch))).toEqual(expected);
  });
});

function world(input: {
  readonly threads?: ReadonlyArray<LiveThread>;
  readonly statuses?: ReadonlyArray<WorktreeStatus>;
  readonly statusOf?: Readonly<Record<string, WorktreeStatus>>;
  readonly removeFails?: string;
}) {
  const removed: string[] = [];
  const archived: string[] = [];
  const statuses = [...(input.statuses ?? [clean, clean])];
  const ports: CleanupPorts = {
    tickets: async () => new Map([["main", [ticket()]]]),
    worktrees: async () => [OTHER, WT],
    threads: () =>
      input.threads ?? [
        { id: "orchestrator", worktreePath: null, working: true, isRoot: true },
        { id: "builder", worktreePath: WT, working: false, isRoot: false },
      ],
    status: async (path) =>
      removed.includes(path)
        ? { ...clean, isRepo: false }
        : (input.statusOf?.[path] ?? statuses.shift() ?? clean),
    remove: async (path) => {
      if (input.removeFails !== undefined) return input.removeFails;
      removed.push(path);
      return null;
    },
    archive: async (id) => void archived.push(id),
  };
  return { ports, removed, archived };
}

describe("cleanupMerged", () => {
  const target = { workspaceRoot: ROOT, folder: "main" };
  const ON_BOARD: ReadonlySet<string> = new Set([WT, OTHER]);

  it("deletes a clean merged worktree, then archives the ticket's threads", async () => {
    const clear = world({});
    expect(await cleanupMerged(clear.ports, target, [ticket()], ON_BOARD)).toEqual(new Map());
    expect(clear.removed).toEqual([WT]);
    expect(clear.archived).toEqual(["builder"]);
  });

  it("keeps a worktree whose legacy evidence this session did not migrate", async () => {
    const failed = world({});
    expect(await cleanupMerged(failed.ports, target, [ticket()], new Set([OTHER]))).toEqual(
      new Map([["T-26", "evidence-missing"]]),
    );
    expect(failed.removed).toEqual([]);
    expect(failed.archived).toEqual([]);
  });

  it("deletes a ticket's clean worktree but archives nothing while its other worktree is kept", async () => {
    const two = world({
      threads: [
        { id: "builder", worktreePath: WT, working: false, isRoot: false },
        { id: "reviewer", worktreePath: `${OTHER}/`, working: false, isRoot: false },
      ],
      statusOf: { [OTHER]: { ...clean, hasWorkingTreeChanges: true } },
    });
    const owner = ticket({
      threads: [
        { threadId: "builder", role: "task" },
        { threadId: "reviewer", role: "reviewer" },
      ],
    });
    expect(await cleanupMerged(two.ports, target, [owner], ON_BOARD)).toEqual(
      new Map([["T-26", "dirty"]]),
    );
    expect(two.removed).toEqual([WT]);
    expect(two.archived).toEqual([]);
  });

  it("archives without a delete when the worktree is already gone", async () => {
    const gone = world({ statuses: [{ ...clean, isRepo: false }] });
    expect(await cleanupMerged(gone.ports, target, [ticket()], ON_BOARD)).toEqual(new Map());
    expect(gone.removed).toEqual([]);
    expect(gone.archived).toEqual(["builder"]);
  });

  it("keeps a worktree that turned dirty between the two reads", async () => {
    const changed = world({
      statuses: [clean, { ...clean, hasWorkingTreeChanges: true }],
    });
    expect(await cleanupMerged(changed.ports, target, [ticket()], ON_BOARD)).toEqual(
      new Map([["T-26", "dirty"]]),
    );
    expect(changed.removed).toEqual([]);
  });

  it("shows git's refusal and archives nothing", async () => {
    const refused = world({
      removeFails: "fatal: contains modified or untracked files",
    });
    expect(await cleanupMerged(refused.ports, target, [ticket()], ON_BOARD)).toEqual(
      new Map([["T-26", "fatal: contains modified or untracked files"]]),
    );
    expect(refused.archived).toEqual([]);
  });

  it("never archives a running agent", async () => {
    const busy = world({
      statuses: [{ ...clean, isRepo: false }],
      threads: [{ id: "builder", worktreePath: null, working: true, isRoot: false }],
    });
    expect(await cleanupMerged(busy.ports, target, [ticket()], ON_BOARD)).toEqual(
      new Map([["T-26", "running"]]),
    );
    expect(busy.archived).toEqual([]);
  });
});

describe("evidenceOnBoardWorktrees", () => {
  it("Given a migration report, when it is read, then only migrated and empty worktrees count", () => {
    const report = [
      `migrated\t${WT}/`,
      "nothing\t/wt/empty",
      `failed\t${OTHER}\tT-1: smoke.png is not on the board`,
      "",
    ].join("\n");
    expect([...evidenceOnBoardWorktrees(report)]).toEqual([WT, "/wt/empty"]);
  });
});

describe("readBoardTickets", () => {
  const tree = (boards: Record<string, string | null>): ProjectFiles => ({
    list: async () =>
      [...Object.keys(boards), "stray"].map((name) => ({
        path: `.agentboard/${name}`,
        kind: "directory",
      })),
    read: async (_cwd, path) => {
      const [, folder, file] = path.split("/");
      if (folder === "stray") return null;
      return file === "board.json" ? "{}" : (boards[folder!] ?? null);
    },
    write: async () => undefined,
  });

  it("reads every board's tickets, skips a folder with no board.json, and fails when a board's tickets.json is missing", async () => {
    const text = JSON.stringify([ticket()]);
    expect(await readBoardTickets(tree({ main: text, other: "[]" }), ROOT)).toEqual(
      new Map([
        ["main", [ticket()]],
        ["other", []],
      ]),
    );
    expect(await readBoardTickets(tree({ main: text, other: null }), ROOT)).toBeNull();
  });
});

describe("runOnePerKey", () => {
  it("runs the newest job sent during a run once that run ends, and drops the ones it replaced", async () => {
    const ran: string[] = [];
    let release = () => {};
    const first = new Promise<void>((resolve) => (release = resolve));
    let finished = () => {};
    const last = new Promise<void>((resolve) => (finished = resolve));
    runOnePerKey("p/main", async () => {
      ran.push("first");
      await first;
    });
    runOnePerKey("p/main", async () => void ran.push("replaced"));
    runOnePerKey("p/main", async () => {
      ran.push("newest");
      finished();
    });
    expect(ran).toEqual(["first"]);
    release();
    await last;
    expect(ran).toEqual(["first", "newest"]);
  });
});
