import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

export interface ProjectWorktree {
  readonly path: string;
  readonly branch: string | null;
  readonly title: string;
}

type WorktreeThread = Pick<
  OrchestrationV2ThreadShell,
  "id" | "projectId" | "title" | "branch" | "worktreePath" | "deletedAt" | "lineage"
>;

/**
 * The worktrees threads use, per project. Board tickets run as sub-agents, so only side chats are
 * skipped. A shared worktree is named by its top thread, the one whose parent does not use it.
 */
export function worktreesByProject(
  threads: ReadonlyArray<WorktreeThread>,
): ReadonlyMap<string, ReadonlyArray<ProjectWorktree>> {
  const byPath = new Map<string, WorktreeThread[]>();
  for (const thread of threads) {
    if (thread.worktreePath === null || thread.deletedAt !== null) continue;
    if (thread.lineage.sideChat === true) continue;
    byPath.set(thread.worktreePath, [...(byPath.get(thread.worktreePath) ?? []), thread]);
  }
  const byProject = new Map<string, ProjectWorktree[]>();
  for (const [path, users] of byPath) {
    const ids = new Set(users.map((user) => user.id));
    const isTop = (user: WorktreeThread) =>
      user.lineage.parentThreadId === null || !ids.has(user.lineage.parentThreadId);
    const owner = users.reduce((best, user) => (isTop(user) && !isTop(best) ? user : best));
    const worktrees = byProject.get(owner.projectId) ?? [];
    worktrees.push({ path, branch: owner.branch, title: owner.title });
    byProject.set(owner.projectId, worktrees);
  }
  return byProject;
}
