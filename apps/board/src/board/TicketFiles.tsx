import { RegistryContext } from "@effect/atom-react";
import { useContext } from "react";

import { FileTree } from "../files/FileTree";
import { trimSlashes } from "../files/target";
import { openFile } from "../state/filesView";
import { ArtifactCards } from "./ArtifactCards";
import type { SectionProps } from "./sectionProps";

/** The ticket worktree's files, then its evidence: the artifacts its agents wrote. */
export function TicketFiles({ environmentId, view, artifacts }: SectionProps) {
  const registry = useContext(RegistryContext);
  const { ticket } = view;
  const cwd = ticket.worktreePath == null ? null : trimSlashes(ticket.worktreePath);
  return (
    <div className="flex flex-col gap-2">
      {cwd === null ? (
        <p className="text-faint">No worktree yet</p>
      ) : (
        // The tree is virtualized, so it needs a height of its own.
        <div className="flex h-72 flex-col rounded-md border border-line">
          <FileTree
            key={cwd}
            environmentId={environmentId}
            cwd={cwd}
            title={`${ticket.key} worktree`}
            onOpenFile={(path) => openFile(registry, { cwd, path })}
          />
        </div>
      )}
      <p className="text-[11px] text-muted">Evidence</p>
      {artifacts.length === 0 ? (
        <p className="text-faint">No evidence yet</p>
      ) : (
        <ArtifactCards artifacts={artifacts} />
      )}
    </div>
  );
}
