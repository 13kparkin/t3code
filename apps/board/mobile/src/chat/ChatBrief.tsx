import { useState } from "react";
import { Pressable } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { ChatMessage } from "./ChatMessage";

export function ChatBrief({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <AppText style={[styles.small, styles.faint]}>Brief sent to the orchestrator</AppText>
      </Pressable>
      {open && <ChatMessage text={text} />}
    </>
  );
}
