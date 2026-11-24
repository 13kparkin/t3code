import { RegistryContext } from "@effect/atom-react";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useContext, useEffect } from "react";

import { isRunLive } from "../chat/timeline";
import { messageOrchestrator } from "../foryou/actions";
import { storeErrorMessage, storeErrorsToSend } from "../orchestrator/storeErrors";
import { useEnvironmentThread } from "../state/threads";

const NO_SENT: ReadonlySet<string> = new Set();

// shortcut: sent errors are remembered per app session; persist them in the board folder if repeats after a restart become noise.
const sentStoreErrorsAtom = Atom.family((boardId: string) =>
  Atom.make(NO_SENT).pipe(Atom.keepAlive, Atom.withLabel(`store-errors-sent:${boardId}`)),
);

/** Sends each new store error to the board's orchestrator while its run is live. */
export function useStoreErrorReports({
  environmentId,
  orchestratorThreadId,
  boardId,
  errors,
}: {
  environmentId: EnvironmentId;
  orchestratorThreadId: string | null;
  boardId: string;
  errors: ReadonlyArray<string>;
}) {
  const registry = useContext(RegistryContext);
  const projection = Option.getOrNull(
    useEnvironmentThread(
      environmentId,
      orchestratorThreadId === null ? null : ThreadId.make(orchestratorThreadId),
    ).data,
  );
  const live = projection !== null && isRunLive(projection);
  // The board rebuilds its error list on every render, so the effect keys on the text.
  const key = errors.join("\0");
  useEffect(() => {
    const atom = sentStoreErrorsAtom(boardId);
    const next = storeErrorsToSend(registry.get(atom), key === "" ? [] : key.split("\0"), live);
    registry.set(atom, next.sent);
    for (const error of next.send) {
      void messageOrchestrator(registry, environmentId, orchestratorThreadId, async () =>
        storeErrorMessage(error),
      ).then((failure) => {
        if (failure === null) return;
        const sent = new Set(registry.get(atom));
        sent.delete(error);
        registry.set(atom, sent);
      });
    }
  }, [registry, environmentId, orchestratorThreadId, boardId, key, live]);
}
