import {
  type CardState,
  type CardView,
  describeRoleTarget,
  type ForYouCard,
  type ForYouItem,
  MERGE_CONDITIONS,
} from "@agent-board/app/domain/forYou";
import { describeTrackerWrite } from "@agent-board/app/issues/issueLinks";
import { useTheme } from "@react-navigation/native";
import { type ReactNode, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { styles } from "../styles";
import { answerApproval, answerItem, type ForYouTarget } from "./actions";
import { ChoiceButton as Choice } from "./ChoiceButton";
import { ItemActions } from "./ItemActions";

const KIND_LABEL = {
  merge_approval: "Merge approval",
  question: "Question",
  ticket_draft: "Ticket draft",
  tracker_write: "Tracker write",
  role_target: "Role change",
  gate: "Gate",
  read: "Read",
  resume: "Resume",
} as const satisfies Record<ForYouItem["kind"], string>;

export const STATE_LABEL = {
  open: "Open",
  sent: "Sent",
  held: "Held",
  resolved: "Resolved",
} as const satisfies Record<CardState, string>;

export const kindLabel = (card: ForYouCard) =>
  card.origin === "file"
    ? KIND_LABEL[card.item.kind]
    : card.request.kind === "approval"
      ? "Approval"
      : "Secret";

function stateLine({ card, state, detail }: CardView): string | null {
  switch (state) {
    case "sent":
      return card.origin === "file"
        ? `Sent to the orchestrator: ${detail}. Waiting for it to record the answer.`
        : `${detail}. Waiting for the engine.`;
    case "resolved":
      return detail === null ? "Resolved." : `Resolved: ${detail}`;
    default:
      return detail;
  }
}

/** One For you card in full, with its choices. The phone answers through the orchestrator or the engine, never the file. */
export function CardSheet({
  view,
  title,
  target,
  onClose,
}: {
  view: CardView;
  title: string;
  target: ForYouTarget;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const text = { color: colors.text };
  const [error, setError] = useState<string | null>(null);
  const { card, state } = view;
  const sent = state === "sent";
  const done = state === "resolved";
  const status = stateLine(view);

  let body: ReactNode;
  if (card.origin === "engine") {
    body =
      card.request.kind === "secret" ? (
        <Text style={text}>Answer on the desktop.</Text>
      ) : (
        <>
          <Text style={text}>{card.request.threadTitle} asks to go on.</Text>
          {!done && (
            <>
              <Choice
                primary
                disabled={sent}
                onPress={() => {
                  setError(null);
                  void answerApproval(target, card, "accept").then(setError);
                }}
              >
                Approve
              </Choice>
              <Choice
                disabled={sent}
                onPress={() => {
                  setError(null);
                  void answerApproval(target, card, "decline").then(setError);
                }}
              >
                Decline
              </Choice>
            </>
          )}
        </>
      );
  } else {
    const { item } = card;
    body = (
      <>
        {item.kind !== "role_target" && item.body.trim() !== "" && (
          <Text selectable style={text}>
            {item.body}
          </Text>
        )}
        {item.kind === "merge_approval" &&
          MERGE_CONDITIONS.map(({ key, label }) => {
            const condition = item.conditions[key];
            return (
              <Text key={key} style={condition.met ? text : styles.error}>
                {condition.met ? "✓" : "✗"} {label}
                {condition.note == null ? "" : `. ${condition.note}`}
              </Text>
            );
          })}
        {item.kind === "tracker_write" && (
          <Text selectable style={[styles.card, text, { borderColor: colors.border }]}>
            {describeTrackerWrite(item.write)}
          </Text>
        )}
        {item.kind === "role_target" ? (
          <Text style={text}>{describeRoleTarget(item.write)}</Text>
        ) : (
          !done && (
            <ItemActions
              item={item}
              sent={sent}
              send={(answer) => {
                setError(null);
                void answerItem(target, card, answer).then(setError);
              }}
            />
          )
        )}
      </>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
          <View style={[styles.header, styles.sheetTop]}>
            <Text style={[styles.headerText, styles.muted, text]}>
              {kindLabel(card)} · {STATE_LABEL[state]}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.body, styles.readable]}
          >
            <Text style={[styles.title, text]}>{title}</Text>
            {body}
            {status !== null && <Text style={[styles.small, text]}>{status}</Text>}
            {error !== null && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
