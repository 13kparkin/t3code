import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { X } from "lucide-react";
import { useContext } from "react";

import { iconButton } from "../browser/styles";
import { forYouBoardsAtom, forYouOpenAtom } from "../state/forYou";
import { ForYouPanelRow } from "./ForYouPanelRow";

/** What waits on the user across every board, slid out beside the left sidebar. */
export function ForYouPanel() {
  const registry = useContext(RegistryContext);
  const open = useAtomValue(forYouOpenAtom);
  const boards = useAtomValue(forYouBoardsAtom);
  if (!open) return null;
  const items = boards.flatMap((board) => board.open.map((item) => ({ board, item })));
  return (
    <aside
      aria-label="For you"
      data-testid="foryou-panel"
      className="absolute inset-y-0 left-0 z-30 flex w-80 flex-col border-r border-line bg-sidebar shadow-panel"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="flex-1 font-semibold">For you</h2>
        <button
          type="button"
          aria-label="Close For you"
          onClick={() => registry.set(forYouOpenAtom, false)}
          className={iconButton}
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <p className="px-2.5 py-3 text-faint">Nothing needs you</p>
        ) : (
          items.map(({ board, item }) => (
            <ForYouPanelRow key={`${board.boardId}/${item.id}`} board={board} item={item} />
          ))
        )}
      </div>
    </aside>
  );
}
