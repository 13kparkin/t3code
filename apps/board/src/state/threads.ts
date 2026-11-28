import { useAtomValue } from "@effect/atom-react";
import {
  cancelQueuedRun,
  interruptThreadTurn,
  promoteQueuedRun,
  setThreadRuntimeMode,
  startThreadTurn,
  type StartThreadTurnInput,
} from "@t3tools/client-runtime/operations";
import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import { createEnvironmentCommand } from "@t3tools/client-runtime/state/runtime";
import {
  createEnvironmentThreadStateAtoms,
  EMPTY_ENVIRONMENT_THREAD_STATE,
  type EnvironmentThreadState,
} from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, RuntimeMode, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

// `message.dispatch` carries no runtime mode, so a provider switch that changes it sets it first,
// and puts the old one back when the turn does not start.
type StartTurnInput = StartThreadTurnInput & { readonly previousRuntimeMode?: RuntimeMode | null };

export const runStartTurn: (input: StartTurnInput) => ReturnType<typeof startThreadTurn> =
  Effect.fn("board.startTurn")(function* (input: StartTurnInput) {
    const { threadId, previousRuntimeMode } = input;
    if (previousRuntimeMode === undefined || previousRuntimeMode === null) {
      return yield* startThreadTurn(input);
    }
    yield* setThreadRuntimeMode({ threadId, runtimeMode: input.runtimeMode });
    return yield* startThreadTurn(input).pipe(
      Effect.tapError(() =>
        Effect.ignore(setThreadRuntimeMode({ threadId, runtimeMode: previousRuntimeMode })),
      ),
    );
  });

export const startTurn = createEnvironmentCommand(connectionAtomRuntime, {
  label: "board:thread:start-turn",
  execute: runStartTurn,
});

export const interruptTurn = createEnvironmentCommand(connectionAtomRuntime, {
  label: "board:thread:interrupt-turn",
  execute: interruptThreadTurn,
});

export const cancelQueued = createEnvironmentCommand(connectionAtomRuntime, {
  label: "board:thread:cancel-queued-run",
  execute: cancelQueuedRun,
});

export const steerQueued = createEnvironmentCommand(connectionAtomRuntime, {
  label: "board:thread:promote-queued-run",
  execute: promoteQueuedRun,
});

/** A thread's live state, which the engine streams while the thread is mounted. */
export const environmentThreads = createEnvironmentThreadStateAtoms(connectionAtomRuntime);

const orchestration = createOrchestrationEnvironmentAtoms(connectionAtomRuntime);

/** One turn item as the engine holds it, with the command output and the diff that the thread's own copy leaves out. */
export const turnItemAtom = orchestration.turnItem;

/** T3's Force stop, which ends the thread's provider session. A later message starts a new one. */
export const forceStopThread = orchestration.forceStopThread;

const NO_THREAD = Atom.make(AsyncResult.success(EMPTY_ENVIRONMENT_THREAD_STATE)).pipe(
  Atom.withLabel("board-thread:none"),
);

/** The thread's live state, or an empty one for a board whose orchestrator has not started. */
export function useEnvironmentThread(
  environmentId: EnvironmentId,
  threadId: ThreadId | null,
): EnvironmentThreadState {
  const result = useAtomValue(
    threadId === null ? NO_THREAD : environmentThreads.stateAtom(environmentId, threadId),
  );
  return AsyncResult.getOrElse(result, () => EMPTY_ENVIRONMENT_THREAD_STATE);
}
