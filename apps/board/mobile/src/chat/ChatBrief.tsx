import { useState } from "react";
import { Pressable, Text } from "react-native";

import { styles } from "../styles";
import { ChatMessage } from "./ChatMessage";

export function ChatBrief({ text, color }: { text: string; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <Text style={[styles.small, styles.muted, { color }]}>Brief sent to the orchestrator</Text>
      </Pressable>
      {open && <ChatMessage text={text} color={color} />}
    </>
  );
}
