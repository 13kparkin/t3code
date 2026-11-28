import { RegistryContext } from "@effect/atom-react";
import { useContext } from "react";

import type { BoardOpenItems } from "../domain/forYou";
import { openCardPage } from "../state/filesView";
import { forYouOpenAtom } from "../state/forYou";
import { showForYouCard } from "./showForYouCard";

export function ForYouPanelRow({
  board,
  item,
}: {
  board: BoardOpenItems;
  item: BoardOpenItems["open"][number];
}) {
  const registry = useContext(RegistryContext);
  return (
    <button
      type="button"
      data-testid="foryou-panel-row"
      onClick={() => {
        showForYouCard(registry, board, item.id);
        openCardPage(registry, item.id);
        registry.set(forYouOpenAtom, false);
      }}
      className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-hover"
    >
      <span className="truncate text-[11px] text-amber-300">
        {board.projectName} / {board.boardName}
      </span>
      <span className="line-clamp-2 text-[12px] text-fg">{item.title}</span>
      <span className="truncate font-mono text-[10px] text-faint">{item.id}</span>
    </button>
  );
}
