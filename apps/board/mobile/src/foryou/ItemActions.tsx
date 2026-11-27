import type { ForYouAnswer, ForYouItem } from "@agent-board/app/domain/forYou";
import { useState } from "react";

import { AppTextInput } from "../AppTextInput";
import { ChoiceButton } from "./ChoiceButton";

export function ItemActions({
  item,
  sent,
  send,
}: {
  item: ForYouItem;
  sent: boolean;
  send: (answer: ForYouAnswer) => void;
}) {
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
        <AppTextInput
          multiline
          editable={!sent}
          value={typed}
          onChangeText={setTyped}
          placeholder="Type your own answer"
          accessibilityLabel="Your answer"
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
