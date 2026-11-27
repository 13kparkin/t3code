import {
  CARD_STATE,
  cardKindLabel,
  cardTitle,
  type CardView,
  describeRoleTarget,
  type ForYouCard,
  MERGE_CONDITIONS,
  sentLine,
} from "@agent-board/app/domain/forYou";
import { describeTrackerWrite } from "@agent-board/app/issues/issueLinks";
import { type ReactNode, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { answerItem, type ForYouTarget } from "./actions";
import { ApprovalBody } from "./ApprovalBody";
import { ItemActions } from "./ItemActions";

function stateLine({ card, state, detail }: CardView): string | null {
  switch (state) {
    case "sent":
      return sentLine(card, detail);
    case "resolved":
      return detail === null ? "Resolved." : `Resolved: ${detail}`;
    default:
      return detail;
  }
}

const content = (card: ForYouCard) =>
  card.origin === "file"
    ? JSON.stringify({ ...card.item, status: undefined, resolution: undefined })
    : card.id;

/** `shown` is the card when the sheet opened. If the file rewrites it, the answer buttons lock. */
export function CardSheet({
  view,
  shown,
  target,
  onClose,
}: {
  view: CardView;
  shown: ForYouCard;
  target: ForYouTarget;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { card, state } = view;
  const changed = content(card) !== content(shown);
  const locked = state === "sent" || changed;
  const done = state === "resolved";
  const status = stateLine(view);

  let body: ReactNode;
  if (card.origin === "engine") {
    body =
      card.request.kind === "secret" ? (
        <AppText>Answer on the desktop.</AppText>
      ) : (
        <ApprovalBody target={target} card={card} sent={locked} onError={setError} />
      );
  } else {
    const { item } = card;
    body = (
      <>
        {item.kind !== "role_target" && item.body.trim() !== "" && (
          <AppText selectable>{item.body}</AppText>
        )}
        {item.kind === "merge_approval" &&
          MERGE_CONDITIONS.map(({ key, label }) => {
            const condition = item.conditions[key];
            return (
              <AppText key={key} style={condition.met ? undefined : styles.error}>
                {condition.met ? "✓" : "✗"} {label}
                {condition.note == null ? "" : `. ${condition.note}`}
              </AppText>
            );
          })}
        {item.kind === "tracker_write" && (
          <AppText selectable style={styles.card}>
            {describeTrackerWrite(item.write)}
          </AppText>
        )}
        {item.kind === "role_target" ? (
          <AppText>{describeRoleTarget(item.write)}</AppText>
        ) : (
          !done && (
            <ItemActions
              item={item}
              sent={locked}
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
        <SafeAreaView style={styles.sheet}>
          <View style={[styles.header, styles.sheetTop]}>
            <AppText style={[styles.headerText, styles.muted]}>
              {cardKindLabel(card)} · {CARD_STATE[state].label}
            </AppText>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <AppText style={styles.link}>Close</AppText>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.body, styles.readable]}
          >
            <AppText style={styles.title}>{cardTitle(card)}</AppText>
            {body}
            {status !== null && <AppText style={styles.small}>{status}</AppText>}
            {changed && (
              <AppText accessibilityRole="alert" style={styles.error}>
                This card changed while open. Close it and open it again to answer.
              </AppText>
            )}
            {error !== null && (
              <AppText accessibilityRole="alert" style={styles.error}>
                {error}
              </AppText>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
