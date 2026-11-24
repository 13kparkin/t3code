import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Inbox } from "lucide-react";
import { useContext } from "react";

import type { BoardOpenItems } from "../domain/forYou";
import { focusedCardAtom, forYouBoardsAtom, forYouOpenAtom } from "../state/forYou";
import { archivedOpenAtom } from "../state/archivedBoards";
import { openBoard } from "../state/boards";
import { laneKey, setFolded } from "../state/boardUi";
import { SidebarRow } from "./SidebarRow";

/** Opens the board that holds the item and marks the item's card there. */
export function showForYouCard(
  registry: Parameters<typeof openBoard>[0],
  board: Pick<BoardOpenItems, "projectId" | "folder" | "boardId">,
  cardId: string,
) {
  void openBoard(registry, { projectId: board.projectId, folder: board.folder });
  void setFolded(registry, laneKey(board.boardId, "for_you"), false);
  registry.set(focusedCardAtom, { boardId: board.boardId, cardId });
}

/** What waits on the user across every board. A press opens or closes the For you slide-out. */
export function ForYouRow() {
  const registry = useContext(RegistryContext);
  const boards = useAtomValue(forYouBoardsAtom);
  const total = boards.reduce((sum, board) => sum + board.open.length, 0);
  const open = useAtomValue(forYouOpenAtom);
  return (
    <SidebarRow
      icon={<Inbox className="size-3.5" />}
      title="For you"
      label={`For you, ${total} open`}
      selected={open}
      onClick={() => {
        registry.set(archivedOpenAtom, false);
        registry.set(forYouOpenAtom, !open);
      }}
      trailing={
        <span
          data-testid="sidebar-foryou-count"
          className={
            total > 0
              ? "rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-black"
              : "text-[11px] text-faint"
          }
        >
          {total}
        </span>
      }
    />
  );
}
