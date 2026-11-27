import { isThreadWorking } from "@agent-board/app/domain/threadWork";
import { useAtomValue } from "@effect/atom-react";
import { LegendList } from "@legendapp/list/react-native";
import type { EnvironmentId, OrchestrationV2ThreadShell } from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { Pressable } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { familyThreadsAtom, inFamily, useFamilyMount } from "./family";
import { ThreadActivity } from "./ThreadActivity";

function statusText(thread: OrchestrationV2ThreadShell) {
  if (isThreadWorking(thread)) return "Working";
  switch (thread.status) {
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "interrupted":
    case "cancelled":
      return "Stopped";
    case "rolled_back":
      return "Rolled back";
    default:
      return "Idle";
  }
}

export function FamilyList({
  environmentId,
  rootId,
}: {
  environmentId: EnvironmentId;
  rootId: string;
}) {
  useFamilyMount(rootId);
  const threads = useAtomValue(familyThreadsAtom(environmentId));
  const family = useMemo(
    () =>
      (threads ?? [])
        .filter((thread) => inFamily(thread, rootId))
        .toSorted((a, b) => Number(isThreadWorking(b)) - Number(isThreadWorking(a))),
    [threads, rootId],
  );
  const [open, setOpen] = useState<OrchestrationV2ThreadShell | null>(null);
  return (
    <>
      <LegendList
        data={family}
        keyExtractor={(thread) => thread.id}
        estimatedItemSize={72}
        style={styles.readable}
        contentContainerStyle={styles.body}
        ListEmptyComponent={
          <AppText style={styles.muted}>
            {threads === undefined ? "Reading the agents" : "No agents yet."}
          </AppText>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => setOpen(item)} style={styles.card}>
            <AppText style={[styles.bold, styles.cardTitle]} numberOfLines={1}>
              {item.title}
            </AppText>
            <AppText style={[styles.small, isThreadWorking(item) ? styles.working : styles.muted]}>
              {item.id === rootId ? "Orchestrator · " : ""}
              {statusText(item)}
            </AppText>
          </Pressable>
        )}
      />
      {open !== null && (
        <ThreadActivity
          environmentId={environmentId}
          threadId={open.id}
          title={open.title}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
