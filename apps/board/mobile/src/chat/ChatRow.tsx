import type { TimelineRow } from "@agent-board/app/chat/timeline";
import { Text, View } from "react-native";

import { styles } from "../styles";
import { ChatMessage } from "./ChatMessage";

export function ChatRow({ row, color }: { row: TimelineRow; color: string }) {
  switch (row.kind) {
    case "user":
      return (
        <View>
          <Text style={[styles.small, styles.bold, { color }]}>You</Text>
          <ChatMessage text={row.text} color={color} />
        </View>
      );
    case "assistant":
      return <ChatMessage text={row.text} color={color} />;
    case "work": {
      const running = row.steps.find((step) => step.running);
      const failed = row.steps.filter((step) => step.failed).length;
      const count = row.steps.length;
      return (
        <Text style={[styles.small, styles.muted, { color }]} numberOfLines={1}>
          {running === undefined
            ? `${count} ${count === 1 ? "tool call" : "tool calls"}`
            : `… ${running.label}`}
          {failed > 0 && <Text style={styles.error}> · {failed} failed</Text>}
        </Text>
      );
    }
    case "notice":
      return <Text style={row.error ? styles.error : [styles.muted, { color }]}>{row.text}</Text>;
  }
}
