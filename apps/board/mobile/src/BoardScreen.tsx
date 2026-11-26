import { parseTickets, STAGE_LABEL } from "@agent-board/app/domain/ticket";
import { useTheme } from "@react-navigation/native";
import * as Result from "effect/Result";
import { ScrollView, Text } from "react-native";

import { summarize } from "./boardSummary";
import sample from "./sample-tickets.json";
import { styles } from "./styles";

const summary = summarize(Result.getOrThrow(parseTickets(JSON.stringify(sample))));

export function BoardScreen() {
  const { colors } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: colors.text }]}>
        {summary.total} tickets, {summary.inProgress} in progress
      </Text>
      {[...summary.byStage]
        .filter(([, count]) => count > 0)
        .map(([stage, count]) => (
          <Text key={stage} style={{ color: colors.text }}>
            {STAGE_LABEL[stage]}: {count}
          </Text>
        ))}
    </ScrollView>
  );
}
