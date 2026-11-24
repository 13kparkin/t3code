import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useContext, useState } from "react";

import { BOARD_FILE } from "../domain/board";
import { boardStoredAtom, projectBoardsAtom } from "../state/boards";
import type { ValidBoard } from "../store/boardFiles";
import { projectKeyOf } from "../store/routedFiles";
import { Tooltip } from "../ui/Tooltip";

export function BoardStorage({
  project,
  listed,
  busy,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  /** The orchestrator is running with the board folder's old path in its brief. */
  busy: boolean;
}) {
  const registry = useContext(RegistryContext);
  const store = window.board?.store;
  const key = projectKeyOf(project.workspaceRoot);
  const storedAtom = boardStoredAtom(`${key}/${listed.folder}/${BOARD_FILE}`);
  const global = useAtomValue(storedAtom);
  const [failure, setFailure] = useState<string | null>(null);
  if (store === undefined || global === null) return null;
  const move = async () => {
    setFailure(null);
    try {
      await store.move({
        direction: global ? "to-project" : "to-store",
        projectRoot: project.workspaceRoot,
        key,
        slug: listed.folder,
      });
      registry.refresh(storedAtom);
      registry.refresh(projectBoardsAtom(project.id));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span>Storage: {global ? "global" : "project"}</span>
      {busy ? (
        <Tooltip text="Stop the orchestrator before moving the board." side="top" align="start">
          <span>
            <button
              type="button"
              data-testid="move-board"
              disabled={busy}
              onClick={() => void move()}
              className="rounded border border-line px-1.5 leading-4 hover:bg-hover hover:text-fg"
            >
              {global ? "Move into project" : "Move to global"}
            </button>
          </span>
        </Tooltip>
      ) : (
        <button
          type="button"
          data-testid="move-board"
          disabled={busy}
          onClick={() => void move()}
          className="rounded border border-line px-1.5 leading-4 hover:bg-hover hover:text-fg"
        >
          {global ? "Move into project" : "Move to global"}
        </button>
      )}
      {failure !== null && (
        <span role="alert" className="min-w-0 truncate text-red-400">
          {failure}
        </span>
      )}
    </div>
  );
}
