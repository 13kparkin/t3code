import type { VcsStatusResult } from "@t3tools/contracts";

import { BOARDS_DIR } from "../domain/board";
import type { Ticket } from "../domain/ticket";
import { trimSlashes } from "../files/target";
import { walk, WORKTREE_ARTIFACTS } from "./artifacts";
import type { ProjectFiles } from "./boardFiles";

type KeepReason =
  | "store-unreadable"
  | "not-merged"
  | "main-checkout"
  | "shared"
  | "running"
  | "threads-unknown"
  | "status-unknown"
  | "dirty"
  | "detached"
  | "unpushed"
  | "no-evidence"
  | "evidence-missing";

type Plan =
  | { readonly kind: "remove" }
  | { readonly kind: "gone" }
  | { readonly kind: "keep"; readonly reason: KeepReason };

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

/** File names relative to each evidence folder. `worktree` is null when the worktree has no folder. */
interface Evidence {
  readonly worktree: ReadonlyArray<string> | null;
  readonly board: ReadonlyArray<string>;
  /** `artifacts/<key>.partial/` exists, so the orchestrator's copy has not finished. */
  readonly partial: boolean;
}

/** Fresh reads for one worktree of a merged ticket. A null field is a read that failed. */
export interface WorktreeFacts {
  readonly ticket: Ticket;
  readonly path: string;
  readonly workspaceRoot: string;
  readonly projectTickets: ReadonlyArray<Ticket> | null;
  readonly threads: ReadonlyArray<LiveThread> | null;
  readonly status: WorktreeStatus | null;
  readonly evidence: Evidence | null;
}

const CLOSED_STAGES: ReadonlySet<string> = new Set(["merged", "off_path"]);

const ownThreadIds = (ticket: Ticket) => new Set((ticket.threads ?? []).map((t) => t.threadId));

const samePath = (a: string | null | undefined, b: string) =>
  a != null && trimSlashes(a) === trimSlashes(b);

const branchSafe = (status: WorktreeStatus) =>
  (status.hasUpstream && status.aheadCount === 0) || status.aheadOfDefaultCount === 0;

const evidenceCopied = ({ worktree, board, partial }: Evidence) => {
  if (worktree === null || partial) return false;
  const copied = new Set(board);
  return worktree.every((name) => copied.has(name));
};

/**
 * Whether a merged ticket's worktree can go. Every check fails closed. The first one that fails,
 * or whose input did not read, keeps the worktree with its reason.
 */
export function planCleanup(facts: WorktreeFacts): Plan {
  const { ticket, path, threads, status, evidence } = facts;
  const keep = (reason: KeepReason): Plan => ({ kind: "keep", reason });
  const own = ownThreadIds(ticket);
  if (facts.projectTickets === null) return keep("store-unreadable");
  if (ticket.stage !== "merged") return keep("not-merged");
  if (samePath(facts.workspaceRoot, path)) return keep("main-checkout");
  if (status === null) return keep("status-unknown");
  if (!status.isRepo) return { kind: "gone" };
  if (threads === null) return keep("threads-unknown");
  const otherTicket = facts.projectTickets.some(
    (other) =>
      other.key !== ticket.key &&
      !CLOSED_STAGES.has(other.stage) &&
      samePath(other.worktreePath, path),
  );
  const otherThread = threads.some(
    (thread) => !own.has(thread.id) && samePath(thread.worktreePath, path),
  );
  if (otherTicket || otherThread) return keep("shared");
  if (threads.some((thread) => own.has(thread.id) && thread.working)) return keep("running");
  if (status.hasWorkingTreeChanges) return keep("dirty");
  // Git keeps a named branch when its worktree goes, so only a detached HEAD can lose commits.
  if (status.refName === null) return keep("detached");
  if (!branchSafe(status)) return keep("unpushed");
  if (evidence?.worktree === null) return keep("no-evidence");
  if (evidence === null || !evidenceCopied(evidence)) return keep("evidence-missing");
  return { kind: "remove" };
}

function ticketWorktrees(ticket: Ticket, threads: ReadonlyArray<LiveThread>): string[] {
  const own = ownThreadIds(ticket);
  const paths = [
    ticket.worktreePath,
    ...threads.filter((thread) => own.has(thread.id)).map((thread) => thread.worktreePath),
  ];
  return [...new Set(paths.flatMap((path) => (path ? [trimSlashes(path)] : [])))];
}

export interface CleanupPorts {
  readonly files: ProjectFiles;
  readonly tickets: () => Promise<ReadonlyArray<Ticket> | null>;
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

async function readEvidence(
  files: ProjectFiles,
  target: CleanupTarget,
  key: string,
  path: string,
): Promise<Evidence | null> {
  const source = `${WORKTREE_ARTIFACTS}/${key}`;
  const copy = `${BOARDS_DIR}/${target.folder}/artifacts/${key}`;
  const under = (root: string) => (names: string[]) =>
    names.map((name) => name.slice(root.length + 1));
  try {
    const [hasSource, board, partial] = await Promise.all([
      files.list(path, source),
      walk(files, target.workspaceRoot, copy, { hidden: true }).then(under(copy)),
      files.list(target.workspaceRoot, `${copy}.partial`),
    ]);
    const worktree =
      hasSource === null ? null : under(source)(await walk(files, path, source, { hidden: true }));
    return { worktree, board, partial: partial !== null };
  } catch {
    return null;
  }
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
): Promise<ReadonlyMap<string, string>> {
  const kept = new Map<string, string>();
  const projectTickets = await ports.tickets().catch(() => null);
  for (const ticket of merged) {
    const facts = async (path: string): Promise<WorktreeFacts> => ({
      ticket,
      path,
      workspaceRoot: target.workspaceRoot,
      projectTickets,
      threads: ports.threads(),
      status: await ports.status(path).catch(() => null),
      evidence: await readEvidence(ports.files, target, ticket.key, path),
    });
    let done = true;
    for (const path of ticketWorktrees(ticket, ports.threads() ?? [])) {
      const first = planCleanup(await facts(path));
      // A second read just before the delete keeps a worktree that changed since the first.
      const plan = first.kind === "remove" ? planCleanup(await facts(path)) : first;
      if (plan.kind === "gone") continue;
      const failure = plan.kind === "keep" ? plan.reason : await ports.remove(path);
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
