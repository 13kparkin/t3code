import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useContext, useState } from "react";

import { SettingsRow } from "../SettingsRow";
import { projectWorktreesAtom } from "../../state/projects";
import { deleteWorktree, worktreesOnDiskAtom } from "../../state/vcs";
import { DeleteWorktreeConfirm } from "./DeleteWorktreeConfirm";

export function ProjectWorktrees({
  project,
  titled,
  removedPaths,
}: {
  project: EnvironmentProject;
  titled: boolean;
  /** Worktrees a cleanup run removed, which the repository's list may not show gone yet. */
  removedPaths: ReadonlySet<string>;
}) {
  const registry = useContext(RegistryContext);
  const known = useAtomValue(projectWorktreesAtom).get(project.id) ?? [];
  // The thread list keeps a worktree after its folder is removed, so the repository says which exist.
  const onDisk = useAtomValue(
    worktreesOnDiskAtom(JSON.stringify([project.environmentId, project.workspaceRoot])),
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const remove = async (path: string) => {
    setFailure(null);
    const text = await deleteWorktree(
      registry,
      { environmentId: project.environmentId, cwd: project.workspaceRoot },
      path,
    );
    setConfirming(null);
    setFailure(text);
  };

  const worktrees = known.filter(
    (worktree) => onDisk?.has(worktree.path) === true && !removedPaths.has(worktree.path),
  );
  return (
    <>
      {titled && <p className="px-3 pt-2 text-xs font-medium text-muted">{project.title}</p>}
      {onDisk === null && <p className="px-3 py-2.5 text-xs text-faint">Loading worktrees…</p>}
      {onDisk !== null && worktrees.length === 0 && (
        <p className="px-3 py-2.5 text-xs text-faint">No worktrees in use.</p>
      )}
      {worktrees.map((worktree) => {
        // Git's branch, which can differ from the one the thread recorded.
        const branch = onDisk?.get(worktree.path) ?? null;
        return (
          <SettingsRow
            key={worktree.path}
            title={worktree.path.split("/").findLast(Boolean) ?? worktree.path}
            description={
              <span className="break-all">
                {worktree.path}
                {` · ${branch ?? "detached"}`} · {worktree.title}
              </span>
            }
            control={
              confirming === worktree.path ? undefined : (
                <button
                  type="button"
                  aria-label={`Delete worktree ${worktree.path}`}
                  onClick={() => setConfirming(worktree.path)}
                  className="rounded-md border border-line px-2.5 py-1 text-fg hover:bg-hover"
                >
                  Delete
                </button>
              )
            }
          >
            {confirming === worktree.path && (
              <DeleteWorktreeConfirm
                detached={branch === null}
                onConfirm={() => void remove(worktree.path)}
                onCancel={() => setConfirming(null)}
              />
            )}
          </SettingsRow>
        );
      })}
      {failure !== null && (
        <p role="alert" className="px-3 py-2 break-words text-red-400">
          {failure}
        </p>
      )}
    </>
  );
}
