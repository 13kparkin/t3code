import type { ForYouAnswer, ForYouItem } from "@agent-board/app/domain/forYou";
import { useTheme } from "@react-navigation/native";
import { useState } from "react";
import { TextInput } from "react-native";

import { styles } from "../styles";
import { ChoiceButton } from "./ChoiceButton";

/** The choices of a `foryou.jsonl` item, the same ones the desktop card offers. */
export function ItemActions({
  item,
  sent,
  send,
}: {
  item: ForYouItem;
  sent: boolean;
  send: (answer: ForYouAnswer) => void;
}) {
  const { colors } = useTheme();
  const [typed, setTyped] = useState("");
  if (item.kind === "question") {
    const text = typed.trim();
    return (
      <>
        {(item.options ?? []).map((option) => (
          <ChoiceButton
            key={option}
            disabled={sent}
            onPress={() => send({ type: "text", text: option })}
          >
            {option}
          </ChoiceButton>
        ))}
        <TextInput
          multiline
          editable={!sent}
          value={typed}
          onChangeText={setTyped}
          placeholder="Type your own answer"
          placeholderTextColor={colors.border}
          accessibilityLabel="Your answer"
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        <ChoiceButton
          primary
          disabled={sent || text === ""}
          onPress={() => send({ type: "text", text })}
        >
          Send answer
        </ChoiceButton>
      </>
    );
  }
  if (item.kind === "read") {
    return (
      <ChoiceButton
        primary
        disabled={sent}
        onPress={() => send({ type: "choice", choice: "read" })}
      >
        Mark read
      </ChoiceButton>
    );
  }
  const yes = item.kind === "resume" ? "resume" : "approve";
  return (
    <>
      <ChoiceButton primary disabled={sent} onPress={() => send({ type: "choice", choice: yes })}>
        {yes === "resume" ? "Resume" : "Approve"}
      </ChoiceButton>
      {item.status !== "held" && (
        <ChoiceButton disabled={sent} onPress={() => send({ type: "choice", choice: "hold" })}>
          Hold
        </ChoiceButton>
      )}
    </>
  );
}
