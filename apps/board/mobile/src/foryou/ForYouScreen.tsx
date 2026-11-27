import { useAtomValue } from "@effect/atom-react";

import { shownBoardAtom } from "../board/files";
import { AppText } from "../AppText";
import { styles } from "../styles";
import { ForYouCards } from "./ForYouCards";

export function ForYouScreen() {
  const shown = useAtomValue(shownBoardAtom);
  if (shown === null) {
    return <AppText style={styles.body}>No board yet.</AppText>;
  }
  if (!shown.listed.ok) {
    return <AppText style={[styles.body, styles.error]}>{shown.listed.issue.message}</AppText>;
  }
  return <ForYouCards key={shown.key} choice={shown} />;
}
