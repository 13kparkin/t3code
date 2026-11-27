import { useAtomValue } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { Text } from "react-native";

import { shownBoardAtom } from "../board/files";
import { styles } from "../styles";
import { ForYouCards } from "./ForYouCards";

export function ForYouScreen() {
  const { colors } = useTheme();
  const shown = useAtomValue(shownBoardAtom);
  if (shown === null) {
    return <Text style={[styles.body, { color: colors.text }]}>No board yet.</Text>;
  }
  if (!shown.listed.ok) {
    return <Text style={[styles.body, styles.error]}>{shown.listed.issue.message}</Text>;
  }
  return <ForYouCards key={shown.key} choice={shown} />;
}
