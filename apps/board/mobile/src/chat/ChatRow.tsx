import type { TimelineRow } from "@agent-board/app/chat/timeline";
import { View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { ChatBrief } from "./ChatBrief";
import { ChatMessage } from "./ChatMessage";

export function ChatRow({ row, brief }: { row: TimelineRow; brief: boolean }) {
  switch (row.kind) {
    case "user":
      return brief ? (
        <ChatBrief text={row.text} />
      ) : (
        <View style={styles.bubble}>
          <ChatMessage text={row.text} />
        </View>
      );
    case "assistant":
      return <ChatMessage text={row.text} />;
    case "work": {
      const running = row.steps.find((step) => step.running);
      const failed = row.steps.filter((step) => step.failed).length;
      const count = row.steps.length;
      return (
        <AppText style={[styles.small, styles.faint]} numberOfLines={1}>
          {running === undefined
            ? `${count} ${count === 1 ? "tool call" : "tool calls"}`
            : `… ${running.label}`}
          {failed > 0 && <AppText style={styles.error}> · {failed} failed</AppText>}
        </AppText>
      );
    }
    case "notice":
      return <AppText style={row.error ? styles.error : styles.muted}>{row.text}</AppText>;
  }
}
