import { createThreadFamilyAtoms } from "@t3tools/client-runtime/state/threads";
import { type EnvironmentId, type OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import { useIsFocused } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { environmentShell } from "../connection/engine";
import { connectionAtomRuntime } from "../connection/runtime";
import { connectedEnvironmentAtom } from "./files";

const threadFamilies = createThreadFamilyAtoms(connectionAtomRuntime, environmentShell.stateAtom);

/** The snapshot changes on every shell event, but its threads only when a thread does. */
export const familyThreadsAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => get(threadFamilies.snapshotAtom(environmentId))?.threads).pipe(
    Atom.withLabel(`phone-family-threads:${environmentId}`),
  ),
);

/** A live member of the orchestrator's family, by the desktop's useThreadFamily rule. */
export const inFamily = (thread: OrchestrationV2ThreadShell, rootId: string) =>
  thread.lineage.rootThreadId === rootId && thread.archivedAt === null && thread.deletedAt === null;

const familyMountAtom = Atom.family((rootId: string) =>
  Atom.make((get) => {
    const environmentId = get(connectedEnvironmentAtom);
    if (environmentId !== null) {
      get.addFinalizer(threadFamilies.mount(get.registry, environmentId, ThreadId.make(rootId)));
    }
  }).pipe(Atom.withLabel(`phone-family-mount:${rootId}`)),
);
const NOT_MOUNTED = Atom.make(undefined).pipe(Atom.withLabel("phone-family-mount:none"));

/** Streams the orchestrator's thread family while the screen is focused. */
export function useFamilyMount(rootId: string | null) {
  useAtomValue(useIsFocused() && rootId !== null ? familyMountAtom(rootId) : NOT_MOUNTED);
}
