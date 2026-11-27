import { useAtomValue } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { Text, View } from "react-native";

import { styles } from "../styles";
import { BoardPicker } from "./BoardPicker";
import { BoardTickets } from "./BoardTickets";
import { boardListAtom, shownBoardAtom } from "./files";

export function BoardScreen() {
  const { colors } = useTheme();
  const list = useAtomValue(boardListAtom);
  const shown = useAtomValue(shownBoardAtom);
  if (list === null) {
    return <Text style={[styles.body, { color: colors.text }]}>Looking for boards</Text>;
  }
  if (list instanceof Error) {
    return <Text style={[styles.body, styles.error]}>{list.message}</Text>;
  }
  return (
    <View style={styles.fill}>
      {list.boards.length > 1 && shown !== null && (
        <BoardPicker boards={list.boards} shown={shown} />
      )}
      {list.problems.map((problem) => (
        <Text key={problem} style={[styles.banner, styles.error]}>
          {problem}
        </Text>
      ))}
      {shown === null ? (
        <Text style={[styles.body, { color: colors.text }]}>
          No project on this PC has a board.
        </Text>
      ) : shown.listed.ok ? (
        <BoardTickets key={shown.key} choice={shown} />
      ) : (
        <Text style={[styles.body, styles.error]}>{shown.listed.issue.message}</Text>
      )}
    </View>
  );
}
