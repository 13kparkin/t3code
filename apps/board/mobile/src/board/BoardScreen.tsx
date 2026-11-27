import { useAtomValue } from "@effect/atom-react";
import { View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { BoardPicker } from "./BoardPicker";
import { BoardTickets } from "./BoardTickets";
import { boardListAtom, shownBoardAtom } from "./files";

export function BoardScreen() {
  const list = useAtomValue(boardListAtom);
  const shown = useAtomValue(shownBoardAtom);
  if (list === null) {
    return <AppText style={styles.body}>Looking for boards</AppText>;
  }
  if (list instanceof Error) {
    return <AppText style={[styles.body, styles.error]}>{list.message}</AppText>;
  }
  return (
    <View style={styles.fill}>
      {list.boards.length > 1 && shown !== null && (
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
        <BoardTickets key={shown.key} choice={shown} />
      ) : (
        <AppText style={[styles.body, styles.error]}>{shown.listed.issue.message}</AppText>
      )}
    </View>
  );
}
