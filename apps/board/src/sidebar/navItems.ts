import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Archive, Globe, Inbox, type LucideIcon } from "lucide-react";
import { useContext } from "react";

import { showBrowser } from "../browser/browserTabs";
import { archivedBoardsAtom, archivedOpenAtom } from "../state/archivedBoards";
import { filesViewAtom } from "../state/filesView";
import { forYouBoardsAtom, forYouOpenAtom } from "../state/forYou";

export interface NavItem {
  readonly id: "foryou" | "browser" | "archived";
  readonly icon: LucideIcon;
  readonly title: string;
  readonly label: string;
  readonly selected: boolean;
  /** Shown beside the row, and as a dot on the rail when `urgent`. */
  readonly count: number | null;
  readonly urgent: boolean;
  readonly onPress: () => void;
}

/** The sidebar's own destinations, which the full sidebar draws as rows and the rail as icons. */
export function useNavItems() {
  const registry = useContext(RegistryContext);
  const forYouTotal = useAtomValue(forYouBoardsAtom).reduce(
    (sum, board) => sum + board.open.length,
    0,
  );
  const forYouOpen = useAtomValue(forYouOpenAtom);
  const { surface } = useAtomValue(filesViewAtom);
  const browsing = surface === "page" || surface === "agents";
  const archivedCount = useAtomValue(archivedBoardsAtom).length;
  const archivedOpen = useAtomValue(archivedOpenAtom);
  return {
    foryou: {
      id: "foryou",
      icon: Inbox,
      title: "For you",
      label: `For you, ${forYouTotal} open`,
      selected: forYouOpen,
      count: forYouTotal,
      urgent: forYouTotal > 0,
      onPress: () => {
        registry.set(archivedOpenAtom, false);
        registry.set(forYouOpenAtom, !forYouOpen);
      },
    },
    browser: {
      id: "browser",
      icon: Globe,
      title: "Browser",
      label: "Browser",
      selected: browsing,
      count: null,
      urgent: false,
      onPress: () => {
        if (!browsing) performance.mark("board:browser-click");
        showBrowser(registry);
      },
    },
    archived: {
      id: "archived",
      icon: Archive,
      title: "Archived boards",
      label: `Archived boards, ${archivedCount}`,
      selected: archivedOpen,
      count: archivedCount,
      urgent: false,
      onPress: () => {
        registry.set(forYouOpenAtom, false);
        registry.set(archivedOpenAtom, !archivedOpen);
      },
    },
  } satisfies Record<NavItem["id"], NavItem>;
}
