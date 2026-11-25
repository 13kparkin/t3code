import { type LinuxHost, shellQuote } from "./wslEngine";

/** `git worktree list --porcelain` for a project root in WSL, or null when git cannot list it. */
export async function listGitWorktrees(
  host: Pick<LinuxHost, "shell">,
  projectRoot: string,
): Promise<string | null> {
  if (!projectRoot.startsWith("/")) return null;
  const result = await host.shell(`git -C ${shellQuote(projectRoot)} worktree list --porcelain\n`, {
    timeoutMs: 10_000,
  });
  return result.exitCode === 0 ? result.stdout : null;
}
