import { type LinuxHost, shellQuote } from "./wslEngine";

/** `git worktree list --porcelain -z` for a project root in WSL, or null when git cannot list it. */
export async function listGitWorktrees(
  host: Pick<LinuxHost, "shell">,
  projectRoot: string,
): Promise<string | null> {
  if (!projectRoot.startsWith("/")) return null;
  const result = await host.shell(
    `git -C ${shellQuote(projectRoot)} worktree list --porcelain -z\n`,
    {
      timeoutMs: 10_000,
    },
  );
  return result.exitCode === 0 ? result.stdout : null;
}

/** Whether an `origin` branch holds a worktree's HEAD, or null when git cannot tell. */
export async function headOnOrigin(
  host: Pick<LinuxHost, "shell">,
  worktree: string,
): Promise<boolean | null> {
  if (!worktree.startsWith("/")) return null;
  const result = await host.shell(
    `git -C ${shellQuote(worktree)} branch -r --contains HEAD --list 'origin/*'\n`,
    { timeoutMs: 10_000 },
  );
  return result.exitCode === 0 ? result.stdout.trim() !== "" : null;
}
