import { cardTitle, cardViews, type ForYouCard } from "@agent-board/app/domain/forYou";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { LegendList } from "@legendapp/list/react-native";
import { useTheme } from "@react-navigation/native";
import { useContext, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";

import { type BoardChoice, useBoardFiles } from "../board/files";
import { forYouEngine } from "../state/threads";
import { styles } from "../styles";
import { boardSent, type ForYouTarget, forYouSentAtom, sentWritesAtom } from "./actions";
import { CardSheet, kindLabel, STATE_LABEL } from "./CardSheet";
import { shownForYouAtom } from "./forYouAtoms";

export function ForYouCards({ choice }: { choice: BoardChoice }) {
  const { colors } = useTheme();
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
        <Text accessibilityRole="alert" style={[styles.banner, styles.error]}>
          foryou.jsonl has {problems === 1 ? "a bad line" : `${problems} bad lines`}. The desktop
          shows which.
        </Text>
      )}
      <LegendList
        data={waiting}
        keyExtractor={(view) => view.card.id}
        extraData={colors}
        estimatedItemSize={64}
        style={styles.readable}
        contentContainerStyle={styles.body}
        ListEmptyComponent={
          <Text style={[styles.muted, { color: colors.text }]}>
            {files === null ? "Reading For you" : "Nothing needs you."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(item.card)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.bold, { color: colors.text }]} numberOfLines={2}>
              {cardTitle(item.card)}
            </Text>
            <Text
              style={[
                styles.small,
                { color: item.state === "open" ? colors.primary : colors.text },
              ]}
            >
              {kindLabel(item.card)} · {STATE_LABEL[item.state]}
            </Text>
          </Pressable>
        )}
      />
      {open !== null && openView !== null && (
        <CardSheet view={openView} shown={open} target={target} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
