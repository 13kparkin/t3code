import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { EmptyFiles } from "../files/EmptyFiles";
import type { FilesRoot } from "../files/target";
import { vcsEnvironment } from "../state/vcs";
import { ChangeSection } from "./ChangeSection";
import { ChangesHeader } from "./ChangesHeader";
import { CommitBox } from "./CommitBox";
import { CommitList } from "./CommitList";

/** One worktree's source control: its branch and base, a commit box, its changes, and its commits. */
export function RootChanges({
  environmentId,
  root,
  orchestratorThreadId,
}: {
  environmentId: EnvironmentId;
  root: FilesRoot;
  orchestratorThreadId: string | null;
}) {
  const status = AsyncResult.getOrElse(
    useAtomValue(vcsEnvironment.status({ environmentId, input: { cwd: root.cwd } })),
    () => null,
  );
  const [filter, setFilter] = useState<string | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  if (status !== null && !status.isRepo)
    return <EmptyFiles>This folder is not a git repository.</EmptyFiles>;

  // Edits made outside the app reach the lists through the status stream, so its totals read them again.
  const revision = JSON.stringify([
    status?.refName,
    status?.workingTree.files.length,
    status?.workingTree.insertions,
    status?.workingTree.deletions,
    status?.branchChanges?.insertions,
    status?.branchChanges?.deletions,
    status?.aheadCount,
    refreshes,
  ]);
  const base = root.base ?? status?.branchChanges?.baseRef ?? null;
  return (
    <div data-testid="changes-panel" className="flex min-h-0 flex-1 flex-col">
      <ChangesHeader
        root={root}
        base={base}
        status={status}
        filter={filter}
        onFilter={setFilter}
        onRefresh={() => setRefreshes(refreshes + 1)}
      />
      <CommitBox
        key={root.cwd}
        environmentId={environmentId}
        cwd={root.cwd}
        status={status}
        tell={{ orchestratorThreadId, worktree: root.label }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChangeSection
          environmentId={environmentId}
          cwd={root.cwd}
          title="Changes"
          source={{ kind: "working-tree" }}
          revision={revision}
          filter={filter ?? ""}
        />
        {(status?.isDefaultRef !== true || root.base !== null) && (
          <ChangeSection
            environmentId={environmentId}
            cwd={root.cwd}
            title={base === null ? "Branch changes" : `Branch vs ${base}`}
            source={{ kind: "branch-range", baseRef: root.base }}
            revision={revision}
            filter={filter ?? ""}
          />
        )}
      </div>
      <CommitList
        environmentId={environmentId}
        cwd={root.cwd}
        baseRef={root.base}
        revision={revision}
      />
    </div>
  );
}
