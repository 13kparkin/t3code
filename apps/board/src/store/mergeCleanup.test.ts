import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "../domain/ticket";
import type { ProjectFiles } from "./boardFiles";
import {
  type CleanupPorts,
  cleanupMerged,
  type LiveThread,
  planCleanup,
  type WorktreeFacts,
  type WorktreeStatus,
} from "./mergeCleanup";

const ROOT = "/repo";
const WT = "/wt/t3-2cc5f690";

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
  threads: [{ id: "builder", worktreePath: WT, working: false, isRoot: false }],
  status: clean,
  evidence: {
    worktree: ["README.txt", "smoke.png"],
    board: ["README.txt", "smoke.png"],
    partial: false,
  },
  ...patch,
});

describe("planCleanup", () => {
  it.each<[string, Partial<WorktreeFacts>, ReturnType<typeof planCleanup>]>([
    ["SAFE: T-26 merged, clean, pushed, evidence on the board", {}, { kind: "remove" }],
    [
      "SAFE after GitHub deleted the merged branch and a fetch pruned it",
      { status: { ...clean, hasUpstream: false, aheadCount: 0, aheadOfDefaultCount: 0 } },
      { kind: "remove" },
    ],
    [
      "squash-merged branch with its upstream pruned",
      { status: { ...clean, hasUpstream: false, aheadCount: 1, aheadOfDefaultCount: 1 } },
      { kind: "keep", reason: "unpushed" },
    ],
    [
      "ASK t3-9dff628b: 2 commits not in main and no upstream",
      { status: { ...clean, hasUpstream: false, aheadCount: 2, aheadOfDefaultCount: 2 } },
      { kind: "keep", reason: "unpushed" },
    ],
    [
      "ASK T-2: one untracked file",
      { status: { ...clean, hasWorkingTreeChanges: true } },
      { kind: "keep", reason: "dirty" },
    ],
    [
      "SAFE t3-03816c33: detached HEAD, clean",
      { status: { ...clean, refName: null } },
      { kind: "keep", reason: "detached" },
    ],
    [
      "KEEP T-39: another open ticket builds in the same worktree",
      { projectTickets: [ticket(), ticket({ key: "T-39", stage: "building" })] },
      { kind: "keep", reason: "shared" },
    ],
    [
      "an off-path ticket on the same worktree does not hold it",
      { projectTickets: [ticket(), ticket({ key: "T-59", stage: "off_path" })] },
      { kind: "remove" },
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
      "skipped t3-c99fb87b: no evidence folder in the worktree",
      { evidence: { worktree: null, board: [], partial: false } },
      { kind: "keep", reason: "no-evidence" },
    ],
    [
      "the orchestrator skipped the evidence copy",
      {
        evidence: { worktree: ["README.txt", "smoke.png"], board: ["README.txt"], partial: false },
      },
      { kind: "keep", reason: "evidence-missing" },
    ],
    [
      "the evidence copy stopped part way",
      {
        evidence: {
          worktree: ["README.txt", "smoke.png"],
          board: ["README.txt", "smoke.png"],
          partial: true,
        },
      },
      { kind: "keep", reason: "evidence-missing" },
    ],
    [
      "the evidence folders did not read",
      { evidence: null },
      { kind: "keep", reason: "evidence-missing" },
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
    ["the worktree is already gone", { status: { ...clean, isRepo: false } }, { kind: "gone" }],
  ])("%s", (_name, patch, expected) => {
    expect(planCleanup(facts(patch))).toEqual(expected);
  });
});

const BOARD = ".agentboard/main";

/** Files listed by `cwd` and relative directory, as `projects.listEntries` lists them. */
function filesOf(tree: Record<string, ReadonlyArray<string>>): ProjectFiles {
  return {
    list: async (cwd, directory) => {
      const prefix = `${directory}/`;
      const children = new Map<string, string>();
      for (const path of tree[cwd] ?? []) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        children.set(rest.split("/")[0]!, rest.includes("/") ? "directory" : "file");
      }
      if (children.size === 0) return null;
      return [...children].map(([name, kind]) => ({ path: `${prefix}${name}`, kind }));
    },
    read: async () => null,
    write: async () => undefined,
  };
}

function world(input: {
  readonly board: ReadonlyArray<string>;
  readonly threads?: ReadonlyArray<LiveThread>;
  readonly statuses?: ReadonlyArray<WorktreeStatus>;
  readonly removeFails?: string;
}) {
  const removed: string[] = [];
  const archived: string[] = [];
  const statuses = [...(input.statuses ?? [clean, clean])];
  const ports: CleanupPorts = {
    files: filesOf({
      [ROOT]: input.board.map((name) => `${BOARD}/artifacts/T-26/${name}`),
      [WT]: [".omp/artifacts/T-26/README.txt", ".omp/artifacts/T-26/smoke.png"],
    }),
    tickets: async () => [ticket()],
    threads: () =>
      input.threads ?? [
        { id: "orchestrator", worktreePath: null, working: true, isRoot: true },
        { id: "builder", worktreePath: WT, working: false, isRoot: false },
      ],
    status: async () =>
      removed.includes(WT) ? { ...clean, isRepo: false } : (statuses.shift() ?? clean),
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

  it("deletes the worktree only once its evidence is on the board, then archives the ticket's threads", async () => {
    const skipped = world({ board: ["README.txt"] });
    expect(await cleanupMerged(skipped.ports, target, [ticket()])).toEqual(
      new Map([["T-26", "evidence-missing"]]),
    );
    expect(skipped.removed).toEqual([]);
    expect(skipped.archived).toEqual([]);

    const copied = world({ board: ["README.txt", "smoke.png"] });
    expect(await cleanupMerged(copied.ports, target, [ticket()])).toEqual(new Map());
    expect(copied.removed).toEqual([WT]);
    expect(copied.archived).toEqual(["builder"]);
  });

  it("archives without a delete when the worktree is already gone, so a second run converges", async () => {
    const gone = world({ board: [], statuses: [{ ...clean, isRepo: false }] });
    expect(await cleanupMerged(gone.ports, target, [ticket()])).toEqual(new Map());
    expect(gone.removed).toEqual([]);
    expect(gone.archived).toEqual(["builder"]);
  });

  it("keeps a worktree that turned dirty between the two reads", async () => {
    const changed = world({
      board: ["README.txt", "smoke.png"],
      statuses: [clean, { ...clean, hasWorkingTreeChanges: true }],
    });
    expect(await cleanupMerged(changed.ports, target, [ticket()])).toEqual(
      new Map([["T-26", "dirty"]]),
    );
    expect(changed.removed).toEqual([]);
  });

  it("shows git's refusal and archives nothing", async () => {
    const refused = world({
      board: ["README.txt", "smoke.png"],
      removeFails: "fatal: contains modified or untracked files",
    });
    expect(await cleanupMerged(refused.ports, target, [ticket()])).toEqual(
      new Map([["T-26", "fatal: contains modified or untracked files"]]),
    );
    expect(refused.archived).toEqual([]);
  });

  it("never archives or stops a running agent", async () => {
    const busy = world({
      board: ["README.txt", "smoke.png"],
      statuses: [{ ...clean, isRepo: false }],
      threads: [{ id: "builder", worktreePath: null, working: true, isRoot: false }],
    });
    expect(await cleanupMerged(busy.ports, target, [ticket()])).toEqual(new Map());
    expect(busy.archived).toEqual([]);
  });
});
