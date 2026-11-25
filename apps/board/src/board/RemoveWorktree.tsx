import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useContext, useState } from "react";

import { formatBytes } from "../settings/settingsModel";
import { DeleteWorktreeConfirm } from "../settings/cleanup/DeleteWorktreeConfirm";
import type { TicketView } from "../state/boardModel";
import { usePrContext } from "../state/prStatus";
import { serverEnvironment } from "../state/server";
import { deleteWorktree, worktreesOnDiskAtom } from "../state/vcs";
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
  const verdict = keptWorktrees.get(view.ticket.key);
  const reason = worktreeKeptReason(view.ticket.stage, verdict ?? null);
  // No verdict yet: no cleanup run has finished for this ticket, so nothing says it is safe.
  const checking = reason === null && verdict === undefined;
  // The repository says which worktrees exist, as on the Cleanup page, and a delete refreshes it.
  const onDisk = useAtomValue(
    worktreesOnDiskAtom(JSON.stringify([project.environmentId, project.workspaceRoot])),
  );
  if (path == null || onDisk?.has(path) !== true) return null;

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
        disabled={reason !== null || checking}
        onClick={() => setConfirming(true)}
        className="rounded border border-line px-1.5 text-[10px] leading-4 text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
      >
        Clean up
      </button>
      <span data-testid="worktree-state" className="truncate">
        {bytes === null ? "size unknown" : formatBytes(bytes)} ·{" "}
        {reason !== null ? `kept: ${reason}` : checking ? "checking" : "safe to remove"}
      </span>
      {(confirming || failure !== null) && (
        <div
          className="absolute inset-x-2 top-[120px] z-10 flex flex-col gap-2 rounded-lg border border-line bg-panel p-2 text-[12px] shadow-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {confirming && (
            <DeleteWorktreeConfirm
              detached={onDisk.get(path) === null}
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
