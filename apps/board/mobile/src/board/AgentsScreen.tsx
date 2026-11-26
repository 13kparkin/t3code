import { useAtomValue } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { Text } from "react-native";

import { styles } from "../styles";
import { FamilyList } from "./FamilyList";
import { shownBoardAtom } from "./files";

export function AgentsScreen() {
  const { colors } = useTheme();
  const shown = useAtomValue(shownBoardAtom);
  const rootId = shown?.listed.ok === true ? shown.listed.board.orchestratorThreadId : null;
  if (shown === null || rootId === null) {
    return (
      <Text style={[styles.body, { color: colors.text }]}>
        {shown === null ? "No board yet." : "This board's orchestrator has not started."}
      </Text>
    );
  }
  return <FamilyList key={rootId} environmentId={shown.project.environmentId} rootId={rootId} />;
}
