import type { ListedBoard } from "@agent-board/app/domain/board";
import { useAtomValue } from "@effect/atom-react";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { BoardPicker } from "./BoardPicker";
import { useWide } from "../shell/useWide";
import { type BoardChoice, boardListAtom, shownBoardAtom } from "./files";

export type ShownBoard = BoardChoice & { readonly listed: Extract<ListedBoard, { ok: true }> };

/** The board picker and scan problems over a screen that reads the shown board. */
export function BoardFrame({ children }: { children: (shown: ShownBoard) => ReactNode }) {
  const list = useAtomValue(boardListAtom);
  const shown = useAtomValue(shownBoardAtom);
  // The wide layout's sidebar lists the boards.
  const wide = useWide();
  if (list === null) return <AppText style={styles.body}>Looking for boards</AppText>;
  if (list instanceof Error) {
    return <AppText style={[styles.body, styles.error]}>{list.message}</AppText>;
  }
  return (
    <View style={styles.fill}>
      {!wide && list.boards.length > 1 && shown !== null && (
        <BoardPicker boards={list.boards} shown={shown} />
      )}
      {list.problems.map((problem) => (
        <AppText key={problem} style={[styles.banner, styles.error]}>
          {problem}
        </AppText>
      ))}
      {shown === null ? (
        <AppText style={styles.body}>No project on this PC has a board.</AppText>
      ) : shown.listed.ok ? (
        children({ ...shown, listed: shown.listed })
      ) : (
        <AppText style={[styles.body, styles.error]}>{shown.listed.issue.message}</AppText>
      )}
    </View>
  );
}
