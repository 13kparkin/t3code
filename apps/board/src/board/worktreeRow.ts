import type { StorageCleanupReport } from "@t3tools/contracts";

/** The size T3's last storage report measured for a worktree, or null when no report names it. */
export const worktreeBytes = (report: StorageCleanupReport | null, path: string): number | null =>
  report?.entries.find((entry) => entry.kind === "worktree" && entry.path === path)?.bytes ?? null;
