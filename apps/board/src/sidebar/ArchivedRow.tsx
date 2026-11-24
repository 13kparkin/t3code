import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Archive } from "lucide-react";
import { useContext } from "react";

import { archivedBoardsAtom, archivedOpenAtom } from "../state/archivedBoards";
import { forYouOpenAtom } from "../state/forYou";
import { SidebarRow } from "./SidebarRow";

export function ArchivedRow() {
  const registry = useContext(RegistryContext);
  const count = useAtomValue(archivedBoardsAtom).length;
  const open = useAtomValue(archivedOpenAtom);
  return (
    <SidebarRow
      icon={<Archive className="size-3.5" />}
      title="Archived boards"
      label={`Archived boards, ${count}`}
      selected={open}
      onClick={() => {
        registry.set(forYouOpenAtom, false);
        registry.set(archivedOpenAtom, !open);
      }}
      trailing={
        <span data-testid="sidebar-archived-count" className="text-[11px] text-faint">
          {count}
        </span>
      }
    />
  );
}
