import type { StorageCleanupReport } from "@t3tools/contracts";

export const worktreeBytes = (report: StorageCleanupReport | null, path: string): number | null =>
  report?.entries.find((entry) => entry.kind === "worktree" && entry.path === path)?.bytes ?? null;

/** Why a ticket's worktree stays: it is not merged, or the last cleanup run kept it for `kept`. Null means it can go. */
export const worktreeKeptReason = (stage: string, kept: string | undefined): string | null =>
  stage !== "merged" ? "not-merged" : (kept ?? null);
