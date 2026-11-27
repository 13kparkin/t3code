import { createThreadFamilyAtoms } from "@t3tools/client-runtime/state/threads";
import { ThreadId } from "@t3tools/contracts";
import { useIsFocused } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { environmentShell } from "../connection/engine";
import { connectionAtomRuntime } from "../connection/runtime";
import { connectedEnvironmentAtom } from "./files";

export const threadFamilies = createThreadFamilyAtoms(
  connectionAtomRuntime,
  environmentShell.stateAtom,
);

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
