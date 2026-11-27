import { timelineSource } from "@agent-board/app/chat/projectionSource";
import { isBrief, isRunLive, timelineRows } from "@agent-board/app/chat/timeline";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { EMPTY_ENVIRONMENT_THREAD_STATE } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useIsFocused } from "@react-navigation/native";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useContext, useRef, useState } from "react";
import { KeyboardAvoidingView, View, type ViewInstance } from "react-native";

import { AppText } from "../AppText";
import { appActiveAtom } from "../board/files";
import { environmentThreads, loadEarlier } from "../state/threads";
import { styles } from "../styles";
import { chatStream, shouldRetryHistory } from "./chat";
import { ChatRow } from "./ChatRow";
import { Composer } from "./Composer";

export function Conversation({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const registry = useContext(RegistryContext);
  const result = useAtomValue(
    chatStream(
      environmentThreads.stateAtom(environmentId, threadId),
      useIsFocused(),
      useAtomValue(appActiveAtom),
    ),
  );
  const state =
    result === null
      ? EMPTY_ENVIRONMENT_THREAD_STATE
      : AsyncResult.getOrElse(result, () => EMPTY_ENVIRONMENT_THREAD_STATE);
  const projection = Option.getOrNull(state.data);
  const rows = projection === null ? [] : timelineRows(timelineSource(projection));
  const failure = Option.getOrNull(state.error);
  // The keyboard's position is in window coordinates, and this screen starts below the header.
  const frame = useRef<ViewInstance>(null);
  const [top, setTop] = useState(0);
  const list = useRef<LegendListRef>(null);
  return (
    <View
      ref={frame}
      style={styles.fill}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setTop(y))}
    >
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={top}
        style={[styles.fill, styles.readable]}
      >
        <LegendList
          ref={list}
          data={rows}
          keyExtractor={(row) => row.id}
          estimatedItemSize={40}
          initialScrollAtEnd
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
          style={styles.fill}
          contentContainerStyle={styles.body}
          ListEmptyComponent={
            <AppText style={projection === null && failure !== null ? styles.error : styles.muted}>
              {projection === null ? (failure ?? "Reading the chat") : "No messages yet"}
            </AppText>
          }
          renderItem={({ item, index }) => (
            <ChatRow row={item} brief={isBrief(item, index, state.history.hasMoreHistory)} />
          )}
        />
        <Composer
          environmentId={environmentId}
          threadId={threadId}
          live={projection !== null && isRunLive(projection)}
          // At the end, maintainScrollAtEnd keeps the new message and its streaming reply in view.
          onSend={() => void list.current?.scrollToEnd({ animated: true })}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
