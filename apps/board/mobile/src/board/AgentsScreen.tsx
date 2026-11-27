import { useAtomValue } from "@effect/atom-react";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { FamilyList } from "./FamilyList";
import { shownBoardAtom } from "./files";

export function AgentsScreen() {
  const shown = useAtomValue(shownBoardAtom);
  if (shown === null) {
    return <AppText style={styles.body}>No board yet.</AppText>;
  }
  const rootId = shown.listed.ok ? shown.listed.board.orchestratorThreadId : null;
  if (rootId === null) {
    return <AppText style={styles.body}>This board's orchestrator has not started.</AppText>;
  }
  return <FamilyList key={rootId} environmentId={shown.project.environmentId} rootId={rootId} />;
}
