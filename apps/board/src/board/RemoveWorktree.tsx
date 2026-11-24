import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useContext, useState } from "react";

import { formatBytes } from "../settings/settingsModel";
import { DeleteWorktreeConfirm } from "../settings/cleanup/DeleteWorktreeConfirm";
import type { TicketView } from "../state/boardModel";
import { usePrContext } from "../state/prStatus";
import { serverEnvironment } from "../state/server";
import { deleteWorktree, vcsEnvironment } from "../state/vcs";
import { worktreeBytes, worktreeKeptReason } from "./worktreeRow";

export function RemoveWorktree({ view }: { view: TicketView }) {
  const registry = useContext(RegistryContext);
  const { project, keptWorktrees } = usePrContext();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const path = view.ticket.worktreePath;
  const report = AsyncResult.getOrElse(
    useAtomValue(
      serverEnvironment.storageCleanupReport({ environmentId: project.environmentId, input: {} }),
    ),
    () => null,
  );
  const bytes = path == null ? null : worktreeBytes(report, path);
  const reason = worktreeKeptReason(view.ticket.stage, keptWorktrees.get(view.ticket.key));
  // The repository says which worktrees exist, as on the Cleanup page, and a delete refreshes it.
  const refs = AsyncResult.getOrElse(
    useAtomValue(
      vcsEnvironment.listRefs({
        environmentId: project.environmentId,
        input: { cwd: project.workspaceRoot, refKind: "local", limit: 200, refresh: true },
      }),
    ),
    () => null,
  );
  if (path == null || !refs?.refs.some((ref) => ref.worktreePath === path)) return null;

  const remove = async () => {
    setFailure(null);
    const text = await deleteWorktree(
      registry,
      { environmentId: project.environmentId, cwd: project.workspaceRoot },
      path,
    );
    setConfirming(false);
    setFailure(text);
  };
  return (
    <>
      <button
        type="button"
        data-testid="remove-worktree"
        onPointerDown={(event) => event.stopPropagation()}
        disabled={reason !== null}
        onClick={() => setConfirming(true)}
        className="rounded border border-line px-1.5 text-[10px] leading-4 text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
      >
        Clean up
      </button>
      <span data-testid="worktree-state" className="truncate">
        {bytes === null ? "size unknown" : formatBytes(bytes)} ·{" "}
        {reason === null ? "safe to remove" : `kept: ${reason}`}
      </span>
      {(confirming || failure !== null) && (
        <div
          className="absolute inset-x-2 top-[120px] z-10 flex flex-col gap-2 rounded-lg border border-line bg-panel p-2 text-[12px] shadow-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {confirming && (
            <DeleteWorktreeConfirm
              onConfirm={() => void remove()}
              onCancel={() => setConfirming(false)}
            />
          )}
          {failure !== null && (
            <p role="alert" className="break-words text-red-400">
              {failure}
            </p>
          )}
        </div>
      )}
    </>
  );
}
