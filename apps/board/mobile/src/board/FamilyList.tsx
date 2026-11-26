import { useAtomValue } from "@effect/atom-react";
import { LegendList } from "@legendapp/list/react-native";
import { createThreadFamilyAtoms } from "@t3tools/client-runtime/state/threads";
import { type EnvironmentId, type OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import { useIsFocused, useTheme } from "@react-navigation/native";
import { Atom } from "effect/reactivity";
import { useMemo, useState } from "react";
import { Pressable, Text } from "react-native";

import { environmentShell } from "../connection/engine";
import { connectionAtomRuntime } from "../connection/runtime";
import { styles } from "../styles";
import { connectedEnvironmentAtom } from "./files";
import { ThreadActivity } from "./ThreadActivity";

const threadFamilies = createThreadFamilyAtoms(connectionAtomRuntime, environmentShell.stateAtom);

/** Reads the engine's family of one orchestrator thread while subscribed. */
const familyMountAtom = Atom.family((rootId: string) =>
  Atom.make((get) => {
    const environmentId = get(connectedEnvironmentAtom);
    if (environmentId !== null) {
      get.addFinalizer(threadFamilies.mount(get.registry, environmentId, ThreadId.make(rootId)));
    }
  }).pipe(Atom.withLabel(`phone-family-mount:${rootId}`)),
);
const NOT_MOUNTED = Atom.make(undefined).pipe(Atom.withLabel("phone-family-mount:none"));

const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting",
]);

// The desktop's `familyThread` rule: an orchestrator's run ends while its delegated tasks keep going.
const isWorking = (thread: OrchestrationV2ThreadShell) =>
  LIVE_STATUSES.has(thread.status) ||
  (thread.activityRunStatus ?? null) !== null ||
  (thread.pendingBackgroundTasks?.length ?? 0) > 0;

function statusText(thread: OrchestrationV2ThreadShell) {
  if (isWorking(thread)) return "Working";
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
  const { colors } = useTheme();
  useAtomValue(useIsFocused() ? familyMountAtom(rootId) : NOT_MOUNTED);
  const threads = useAtomValue(threadFamilies.snapshotAtom(environmentId))?.threads;
  const family = useMemo(
    () =>
      (threads ?? [])
        .filter(
          (thread) =>
            thread.lineage.rootThreadId === rootId &&
            thread.archivedAt === null &&
            thread.deletedAt === null,
        )
        .toSorted((a, b) => Number(isWorking(b)) - Number(isWorking(a))),
    [threads, rootId],
  );
  const [open, setOpen] = useState<OrchestrationV2ThreadShell | null>(null);
  return (
    <>
      <LegendList
        data={family}
        keyExtractor={(thread) => thread.id}
        extraData={colors}
        estimatedItemSize={72}
        contentContainerStyle={styles.body}
        ListEmptyComponent={
          <Text style={[styles.muted, { color: colors.text }]}>
            {threads === undefined ? "Reading the agents" : "No agents yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(item)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.bold, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.small, { color: isWorking(item) ? colors.primary : colors.text }]}>
              {item.id === rootId ? "Orchestrator · " : ""}
              {statusText(item)}
            </Text>
            {item.latestVisibleMessage !== null && (
              <Text style={[styles.small, styles.muted, { color: colors.text }]} numberOfLines={1}>
                {item.latestVisibleMessage.text}
              </Text>
            )}
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
