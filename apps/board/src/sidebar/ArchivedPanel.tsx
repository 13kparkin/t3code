import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { ArchiveRestore, X } from "lucide-react";
import { useContext, useState } from "react";

import { iconButton } from "../browser/styles";
import { type ArchivedBoard, archivedBoardsAtom, archivedOpenAtom } from "../state/archivedBoards";
import { openBoard, setBoardArchived } from "../state/boards";
import { Tooltip } from "../ui/Tooltip";

export function ArchivedPanel() {
  const registry = useContext(RegistryContext);
  const open = useAtomValue(archivedOpenAtom);
  const boards = useAtomValue(archivedBoardsAtom);
  const [failure, setFailure] = useState<string | null>(null);
  if (!open) return null;
  const restore = async ({ project, listed }: ArchivedBoard) => {
    setFailure(null);
    try {
      await setBoardArchived(registry, project, listed, false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <aside
      aria-label="Archived boards"
      data-testid="archived-panel"
      className="absolute inset-y-0 left-0 z-30 flex w-80 flex-col border-r border-line bg-sidebar shadow-panel"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="flex-1 font-semibold">Archived boards</h2>
        <button
          type="button"
          aria-label="Close Archived boards"
          onClick={() => registry.set(archivedOpenAtom, false)}
          className={iconButton}
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {boards.length === 0 && <p className="px-2.5 py-3 text-faint">No archived boards</p>}
        {boards.map((entry) => (
          <div
            key={`${entry.project.id}/${entry.listed.folder}`}
            data-testid="archived-row"
            data-board={entry.listed.board.name}
            className="flex items-center gap-1 rounded-md hover:bg-hover"
          >
            <button
              type="button"
              onClick={() => {
                void openBoard(registry, {
                  projectId: entry.project.id,
                  folder: entry.listed.folder,
                });
                registry.set(archivedOpenAtom, false);
              }}
              className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2 text-left"
            >
              <span className="truncate text-[11px] text-muted">{entry.project.title}</span>
              <span className="truncate text-[12px] text-fg">{entry.listed.board.name}</span>
            </button>
            <Tooltip text="Unarchive" side="bottom" align="end">
              <button
                type="button"
                aria-label={`Unarchive ${entry.listed.board.name}`}
                onClick={() => void restore(entry)}
                className={`${iconButton} mr-1`}
              >
                <ArchiveRestore className="size-4" aria-hidden />
              </button>
            </Tooltip>
          </div>
        ))}
        {failure !== null && (
          <p role="alert" className="px-2.5 py-2 break-words text-red-400">
            {failure}
          </p>
        )}
      </div>
    </aside>
  );
}
