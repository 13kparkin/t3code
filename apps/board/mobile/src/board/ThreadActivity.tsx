import { timelineSource } from "@agent-board/app/chat/projectionSource";
import { type TimelineRow, timelineRows } from "@agent-board/app/chat/timeline";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { LegendList } from "@legendapp/list/react-native";
import { EMPTY_ENVIRONMENT_THREAD_STATE } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useContext } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { shouldRetryHistory } from "../chat/chat";
import { environmentThreads, loadEarlier } from "../state/threads";
import { AppText } from "../AppText";
import { styles } from "../styles";

function rowLines(row: TimelineRow): ReadonlyArray<{ id: string; text: string; error: boolean }> {
  switch (row.kind) {
    case "user":
      return [{ id: row.id, text: `You: ${row.text}`, error: false }];
    case "assistant":
      return [{ id: row.id, text: row.text, error: false }];
    case "work":
      return row.steps.map((step) => ({
        id: step.id,
        text: `${step.running ? "… " : ""}${step.label}`,
        error: step.failed,
      }));
    case "notice":
      return [{ id: row.id, text: row.text, error: row.error }];
  }
}

export function ThreadActivity({
  environmentId,
  threadId,
  title,
  onClose,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  title: string;
  onClose: () => void;
}) {
  const registry = useContext(RegistryContext);
  const state = AsyncResult.getOrElse(
    useAtomValue(environmentThreads.stateAtom(environmentId, threadId)),
    () => EMPTY_ENVIRONMENT_THREAD_STATE,
  );
  const projection = Option.getOrNull(state.data);
  const rows = projection === null ? [] : timelineRows(timelineSource(projection));
  const failure = Option.getOrNull(state.error);
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.sheet}>
          <View style={[styles.header, styles.sheetTop]}>
            <AppText style={styles.headerText} numberOfLines={1}>
              {title}
            </AppText>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <AppText style={styles.link}>Close</AppText>
            </Pressable>
          </View>
          <LegendList
            data={rows}
            keyExtractor={(row) => row.id}
            estimatedItemSize={40}
            maintainScrollAtEnd
            maintainVisibleContentPosition
            onStartReached={() => void loadEarlier(registry, environmentId, threadId)}
            onScrollBeginDrag={({ nativeEvent }) => {
              if (
                shouldRetryHistory(
                  state.history,
                  nativeEvent.contentOffset.y,
                  nativeEvent.layoutMeasurement.height,
                )
              )
                void loadEarlier(registry, environmentId, threadId);
            }}
            style={styles.readable}
            contentContainerStyle={styles.body}
            ListEmptyComponent={
              <AppText
                style={projection === null && failure !== null ? styles.error : styles.muted}
              >
                {projection === null ? (failure ?? "Reading the thread") : "Nothing yet"}
              </AppText>
            }
            renderItem={({ item }) => (
              <View>
                {rowLines(item).map((line) => (
                  <AppText key={line.id} style={line.error ? styles.error : undefined}>
                    {line.text}
                  </AppText>
                ))}
              </View>
            )}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
