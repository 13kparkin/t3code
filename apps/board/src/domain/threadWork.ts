const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting",
]);

/**
 * Whether a thread is working. An orchestrator's own run ends while its delegated tasks keep going,
 * so the status alone says nothing about them. The engine refuses an archive until none of these show.
 */
export const isThreadWorking = (shell: {
  readonly status: string;
  readonly activityRunStatus?: string | null | undefined;
  readonly pendingBackgroundTasks?: ReadonlyArray<unknown> | undefined;
}): boolean =>
  LIVE_STATUSES.has(shell.status) ||
  (shell.activityRunStatus ?? null) !== null ||
  (shell.pendingBackgroundTasks?.length ?? 0) > 0;
