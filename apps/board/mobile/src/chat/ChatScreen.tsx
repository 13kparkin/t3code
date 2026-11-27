import { useAtomValue } from "@effect/atom-react";
import { ThreadId } from "@t3tools/contracts";
import { useTheme } from "@react-navigation/native";
import { Text } from "react-native";

import { shownBoardAtom } from "../board/files";
import { styles } from "../styles";
import { Conversation } from "./Conversation";

export function ChatScreen() {
  const { colors } = useTheme();
  const shown = useAtomValue(shownBoardAtom);
  if (shown === null) {
    return <Text style={[styles.body, { color: colors.text }]}>No board yet.</Text>;
  }
  if (!shown.listed.ok) {
    return <Text style={[styles.body, styles.error]}>{shown.listed.issue.message}</Text>;
  }
  const threadId = shown.listed.board.orchestratorThreadId;
  if (threadId === null) {
    return (
      <Text style={[styles.body, { color: colors.text }]}>
        This board has no orchestrator yet. Start it in the Agent Board desktop app.
      </Text>
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
