export interface GitWorktree {
  readonly path: string;
  readonly branch: string | null;
  /** The project's own checkout, which git lists first and which is never removable. */
  readonly main: boolean;
}

/** Reads `git worktree list --porcelain`. A `prunable` record's folder is gone, so it is skipped, as T3's `listWorktreePaths` does. */
export function parseWorktreeList(stdout: string): ReadonlyArray<GitWorktree> {
  return stdout
    .split(/\n\n+/)
    .map((record) => record.split("\n"))
    .flatMap((fields, index) => {
      const path = fields.find((field) => field.startsWith("worktree "))?.slice("worktree ".length);
      if (path === undefined || fields.some((field) => field.startsWith("prunable"))) return [];
      const branch = fields
        .find((field) => field.startsWith("branch refs/heads/"))
        ?.slice("branch refs/heads/".length);
      return [{ path, branch: branch ?? null, main: index === 0 }];
    });
}
