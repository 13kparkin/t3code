import type { VcsStatusResult } from "@t3tools/contracts";
import * as Result from "effect/Result";

import { BOARDS_DIR } from "../domain/board";
import { parseTickets, type Ticket } from "../domain/ticket";
import { trimSlashes } from "../files/target";
import type { ProjectFiles } from "./boardFiles";

type KeepReason =
  | "store-unreadable"
  | "not-merged"
  | "relative-path"
  | "main-checkout"
  | "unlisted"
  | "shared"
  | "running"
  | "threads-unknown"
  | "status-unknown"
  | "dirty"
  | "unpushed"
  | "evidence-missing";

type Plan =
  | { readonly kind: "remove"; readonly path: string }
  | { readonly kind: "gone" }
  | { readonly kind: "keep"; readonly reason: KeepReason }
  | { readonly kind: "read-status" };

export interface LiveThread {
  readonly id: string;
  readonly worktreePath: string | null;
  readonly working: boolean;
  readonly isRoot: boolean;
}

export type WorktreeStatus = Pick<
  VcsStatusResult,
  | "isRepo"
  | "hasWorkingTreeChanges"
  | "refName"
  | "hasUpstream"
  | "aheadCount"
  | "aheadOfDefaultCount"
>;

/** Reads for one worktree of a merged ticket. A null field is a read that failed; undefined is not read yet. */
export interface WorktreeFacts {
  readonly ticket: Ticket;
  readonly path: string;
  readonly workspaceRoot: string;
  readonly projectTickets: ReadonlyArray<Ticket> | null;
  /** The worktree paths git lists for the project. */
  readonly listed: ReadonlyArray<string> | null;
  readonly threads: ReadonlyArray<LiveThread> | null;
  readonly status?: WorktreeStatus | null;
  readonly evidenceOnBoard: boolean;
}

const ABSOLUTE = /^(\/|[A-Za-z]:[\\/])/;

const CLOSED_STAGES: ReadonlySet<string> = new Set(["merged", "off_path"]);

const ownThreadIds = (ticket: Ticket) => new Set((ticket.threads ?? []).map((t) => t.threadId));

const samePath = (a: string | null | undefined, b: string) =>
  a != null && trimSlashes(a) === trimSlashes(b);

// A worktree that detached since git listed it reports no ahead count, so it is never safe.
const branchSafe = (status: WorktreeStatus) =>
  status.refName !== null &&
  ((status.hasUpstream && status.aheadCount === 0) || status.aheadOfDefaultCount === 0);

/**
 * Whether a merged ticket's worktree can go. Every check fails closed. The first one that fails,
 * or whose input did not read, keeps the worktree with its reason. Checks that need no engine call
 * come first.
 */
export function planCleanup(facts: WorktreeFacts): Plan {
  const { ticket, path, listed, threads, status } = facts;
  const keep = (reason: KeepReason): Plan => ({ kind: "keep", reason });
  if (facts.projectTickets === null) return keep("store-unreadable");
  if (ticket.stage !== "merged") return keep("not-merged");
  if (!ABSOLUTE.test(path)) return keep("relative-path");
  if (samePath(facts.workspaceRoot, path)) return keep("main-checkout");
  if (listed === null) return keep("unlisted");
  if (threads === null) return keep("threads-unknown");
  // Git deletes the folder it resolves, so only a path git lists as written can be trusted.
  const worktree = listed.find((entry) => samePath(entry, path));
  if (worktree === undefined) {
    if (status === undefined) return { kind: "read-status" };
    if (status === null) return keep("status-unknown");
    return status.isRepo ? keep("unlisted") : { kind: "gone" };
  }
  const own = ownThreadIds(ticket);
  const otherTicket = facts.projectTickets.some(
    (other) =>
      other.key !== ticket.key &&
      !CLOSED_STAGES.has(other.stage) &&
      samePath(other.worktreePath, worktree),
  );
  const otherThread = threads.some(
    (thread) => !own.has(thread.id) && samePath(thread.worktreePath, worktree),
  );
  if (otherTicket || otherThread) return keep("shared");
  if (threads.some((thread) => own.has(thread.id) && thread.working)) return keep("running");
  if (status === undefined) return { kind: "read-status" };
  if (status === null) return keep("status-unknown");
  if (!status.isRepo) return { kind: "gone" };
  if (status.hasWorkingTreeChanges) return keep("dirty");
  if (!branchSafe(status)) return keep("unpushed");
  if (!facts.evidenceOnBoard) return keep("evidence-missing");
  return { kind: "remove", path: worktree };
}

export function ticketWorktrees(ticket: Ticket, threads: ReadonlyArray<LiveThread>): string[] {
  const own = ownThreadIds(ticket);
  const paths = [
    ticket.worktreePath,
    ...threads.filter((thread) => own.has(thread.id)).map((thread) => thread.worktreePath),
  ];
  return [...new Set(paths.flatMap((path) => (path ? [trimSlashes(path)] : [])))];
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function evidenceOnBoardWorktrees(report: string): ReadonlySet<string> {
  return new Set(
    report.split("\n").flatMap((line) => {
      const [status, path] = line.split("\t");
      return (status === "migrated" || status === "nothing") && path ? [trimSlashes(path)] : [];
    }),
  );
}

/**
 * Every board's tickets by folder, or null when any board's `tickets.json` is missing or invalid.
 * A folder without `board.json` is not a board, as in `listBoards`.
 */
export async function readBoardTickets(
  files: ProjectFiles,
  workspaceRoot: string,
): Promise<ReadonlyMap<string, ReadonlyArray<Ticket>> | null> {
  const entries = await files.list(workspaceRoot, BOARDS_DIR);
  if (entries === null) return null;
  const boards = new Map<string, ReadonlyArray<Ticket>>();
  for (const entry of entries) {
    if (entry.kind !== "directory") continue;
    if ((await files.read(workspaceRoot, `${entry.path}/board.json`)) === null) continue;
    const text = await files.read(workspaceRoot, `${entry.path}/tickets.json`);
    const parsed = text === null ? null : parseTickets(text);
    if (parsed === null || Result.isFailure(parsed)) return null;
    boards.set(baseName(entry.path), parsed.success);
  }
  return boards;
}

const runningJobs = new Set<string>();
const queuedJobs = new Map<string, () => Promise<void>>();

/** Runs one job per key at a time. A job sent while one runs waits for it, and replaces any job already waiting. */
export function runOnePerKey(key: string, job: () => Promise<void>): void {
  if (runningJobs.has(key)) {
    queuedJobs.set(key, job);
    return;
  }
  runningJobs.add(key);
  void job()
    .catch(() => undefined)
    .finally(() => {
      runningJobs.delete(key);
      const next = queuedJobs.get(key);
      queuedJobs.delete(key);
      if (next !== undefined) runOnePerKey(key, next);
    });
}

export interface CleanupPorts {
  readonly tickets: () => Promise<ReadonlyMap<string, ReadonlyArray<Ticket>> | null>;
  readonly worktrees: () => Promise<ReadonlyArray<string> | null>;
  /** The project's live threads, or null before the engine's snapshot loads. */
  readonly threads: () => ReadonlyArray<LiveThread> | null;
  readonly status: (path: string) => Promise<WorktreeStatus | null>;
  /** Git's own worktree delete, without force. Resolves to the failure text, or null once it is gone. */
  readonly remove: (path: string) => Promise<string | null>;
  readonly archive: (threadId: string) => Promise<void>;
}

export interface CleanupTarget {
  readonly workspaceRoot: string;
  readonly folder: string;
}

/**
 * Deletes the merged tickets' worktrees that pass every check in `planCleanup`, then archives the
 * ticket's own threads once its worktrees are gone. Each run reads the world again and stores
 * nothing, so a run that stopped part way is finished by the next. Resolves to the reason each
 * kept ticket shows.
 */
export async function cleanupMerged(
  ports: CleanupPorts,
  target: CleanupTarget,
  merged: ReadonlyArray<Ticket>,
  evidenceOnBoard: ReadonlySet<string>,
): Promise<ReadonlyMap<string, string>> {
  const kept = new Map<string, string>();
  const [boards, listed] = await Promise.all([
    ports.tickets().catch(() => null),
    ports.worktrees().catch(() => null),
  ]);
  const plan = async (facts: WorktreeFacts): Promise<Exclude<Plan, { kind: "read-status" }>> => {
    const next = planCleanup(facts);
    if (next.kind !== "read-status") return next;
    return plan({ ...facts, status: await ports.status(facts.path).catch(() => null) });
  };
  const facts = (
    ticket: Ticket,
    path: string,
    read: ReadonlyMap<string, ReadonlyArray<Ticket>> | null,
  ): WorktreeFacts => ({
    ticket,
    path,
    workspaceRoot: target.workspaceRoot,
    projectTickets: read === null ? null : [...read.values()].flat(),
    listed,
    threads: ports.threads(),
    evidenceOnBoard: evidenceOnBoard.has(trimSlashes(path)),
  });
  for (const ticket of merged) {
    let done = true;
    for (const path of ticketWorktrees(ticket, ports.threads() ?? [])) {
      let decided = await plan(facts(ticket, path, boards));
      if (decided.kind === "remove") {
        // Read again just before the delete, status first, so a change since the first read keeps it.
        const status = await ports.status(path).catch(() => null);
        const fresh = await ports.tickets().catch(() => null);
        const current = fresh?.get(target.folder)?.find((each) => each.key === ticket.key);
        decided =
          fresh !== null && current === undefined
            ? { kind: "keep", reason: "not-merged" }
            : await plan({ ...facts(current ?? ticket, path, fresh), status });
      }
      if (decided.kind === "gone") continue;
      const failure = decided.kind === "keep" ? decided.reason : await ports.remove(decided.path);
      if (failure !== null) {
        kept.set(ticket.key, failure);
        done = false;
      }
    }
    if (!done) continue;
    const own = ownThreadIds(ticket);
    const threads = ports.threads();
    if (threads === null) continue;
    const live = threads.filter((thread) => own.has(thread.id) && !thread.isRoot);
    if (live.some((thread) => thread.working)) continue;
    for (const thread of live) await ports.archive(thread.id).catch(() => undefined);
  }
  return kept;
}
