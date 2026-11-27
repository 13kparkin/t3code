import {
  CARD_STATE,
  cardKindLabel,
  cardTitle,
  cardViews,
  type ForYouCard,
} from "@agent-board/app/domain/forYou";
import { toneStyle } from "@agent-board/app/theme/tokens";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { LegendList } from "@legendapp/list/react-native";
import { useContext, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "../AppText";
import { type BoardChoice, useBoardFiles } from "../board/files";
import { forYouEngine } from "../state/threads";
import { styles } from "../styles";
import { boardSent, type ForYouTarget, forYouSentAtom, sentWritesAtom } from "./actions";
import { CardSheet } from "./CardSheet";
import { shownForYouAtom } from "./forYouAtoms";

export function ForYouCards({ choice }: { choice: BoardChoice }) {
  const registry = useContext(RegistryContext);
  const files = useBoardFiles(choice.key);
  const list = useAtomValue(shownForYouAtom);
  const sent = useAtomValue(forYouSentAtom);
  const writes = useAtomValue(sentWritesAtom);
  const views = useMemo(
    () =>
      list === null ? [] : cardViews(list.cards, boardSent(sent, writes, choice.key, list.cards)),
    [list, sent, writes, choice.key],
  );
  const waiting = useMemo(() => views.filter((view) => view.state !== "resolved"), [views]);
  const orchestratorThreadId = choice.listed.ok ? choice.listed.board.orchestratorThreadId : null;
  const target = useMemo(
    (): ForYouTarget => ({
      registry,
      engine: forYouEngine(registry, choice.project.environmentId, orchestratorThreadId),
      environmentId: choice.project.environmentId,
      boardKey: choice.key,
      projectId: choice.project.id,
    }),
    [registry, choice, orchestratorThreadId],
  );
  const [open, setOpen] = useState<ForYouCard | null>(null);
  const openView = views.find((view) => view.card.id === open?.id) ?? null;
  const problems = list?.problems.length ?? 0;
  return (
    <>
      {problems > 0 && (
        <AppText accessibilityRole="alert" style={[styles.banner, styles.error]}>
          foryou.jsonl has {problems === 1 ? "a bad line" : `${problems} bad lines`}. The desktop
          shows which.
        </AppText>
      )}
      <LegendList
        data={waiting}
        keyExtractor={(view) => view.card.id}
        estimatedItemSize={64}
        style={styles.readable}
        contentContainerStyle={styles.body}
        ListEmptyComponent={
          <AppText style={styles.muted}>
            {files === null ? "Reading For you" : "Nothing needs you."}
          </AppText>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(item.card)}
            style={styles.card}
          >
            <View style={styles.cardRow}>
              <AppText style={[styles.tag, styles.muted, styles.bold]}>
                {cardKindLabel(item.card)}
              </AppText>
              <View style={styles.fill} />
              <AppText style={[styles.tag, toneStyle(CARD_STATE[item.state].chip)]}>
                {CARD_STATE[item.state].label}
              </AppText>
            </View>
            <AppText style={[styles.bold, styles.cardTitle]} numberOfLines={2}>
              {cardTitle(item.card)}
            </AppText>
          </Pressable>
        )}
      />
      {open !== null && openView !== null && (
        <CardSheet view={openView} shown={open} target={target} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
