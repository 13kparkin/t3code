import type { BoardOpenItems } from "../domain/forYou";
import { focusedCardAtom } from "../state/forYou";
import { openBoard } from "../state/boards";
import { laneKey, setFolded } from "../state/boardUi";

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
