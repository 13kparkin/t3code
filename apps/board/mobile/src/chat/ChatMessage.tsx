import { Text } from "react-native";

import { styles } from "../styles";
import { codeSpans } from "./chat";

/** A message as plain selectable text, with its code spans in monospace. */
export function ChatMessage({ text, color }: { text: string; color: string }) {
  return (
    <Text selectable style={{ color }}>
      {codeSpans(text).map((span, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a span is its position in the text
        <Text key={index} style={span.code ? styles.code : undefined}>
          {span.text}
        </Text>
      ))}
    </Text>
  );
}
