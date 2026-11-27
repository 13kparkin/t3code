import { useAtomValue } from "@effect/atom-react";
import { ThreadId } from "@t3tools/contracts";

import { shownBoardAtom } from "../board/files";
import { AppText } from "../AppText";
import { styles } from "../styles";
import { Conversation } from "./Conversation";

export function ChatScreen() {
  const shown = useAtomValue(shownBoardAtom);
  if (shown === null) {
    return <AppText style={styles.body}>No board yet.</AppText>;
  }
  if (!shown.listed.ok) {
    return <AppText style={[styles.body, styles.error]}>{shown.listed.issue.message}</AppText>;
  }
  const threadId = shown.listed.board.orchestratorThreadId;
  if (threadId === null) {
    return (
      <AppText style={styles.body}>
        This board has no orchestrator yet. Start it in the Agent Board desktop app.
      </AppText>
    );
  }
  return (
    <Conversation
      key={shown.key}
      environmentId={shown.project.environmentId}
      threadId={ThreadId.make(threadId)}
    />
  );
}
