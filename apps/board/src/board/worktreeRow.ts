import type { StorageCleanupReport } from "@t3tools/contracts";

export const worktreeBytes = (report: StorageCleanupReport | null, path: string): number | null =>
  report?.entries.find((entry) => entry.kind === "worktree" && entry.path === path)?.bytes ?? null;

export const worktreeKeptReason = (stage: string, kept: string | null): string | null =>
  stage !== "merged" ? "not-merged" : (kept ?? null);
