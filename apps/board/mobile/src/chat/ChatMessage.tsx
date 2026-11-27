import { AppText } from "../AppText";
import { styles } from "../styles";
import { codeSpans } from "./chat";

export function ChatMessage({ text }: { text: string }) {
  return (
    <AppText selectable>
      {codeSpans(text).map((span, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a span is its position in the text
        <AppText key={index} style={span.code ? styles.code : undefined}>
          {span.text}
        </AppText>
      ))}
    </AppText>
  );
}
