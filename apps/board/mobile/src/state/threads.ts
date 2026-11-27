import { respondToThreadApproval, startThreadTurn } from "@t3tools/client-runtime/operations";
import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";
import { createEnvironmentCommand, runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, MessageId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";
import * as ExpoCrypto from "expo-crypto";

import { commandError, environmentSnapshot } from "../connection/engine";
import { connectionAtomRuntime } from "../connection/runtime";
import type { ForYouEngine } from "../foryou/actions";

const startTurn = createEnvironmentCommand(connectionAtomRuntime, {
  label: "phone:thread:start-turn",
  execute: startThreadTurn,
});

const respondApproval = createEnvironmentCommand(connectionAtomRuntime, {
  label: "phone:foryou:respond-approval",
  execute: respondToThreadApproval,
});

const issues = createIssueEnvironmentAtoms(connectionAtomRuntime);

const quiet = { reportFailure: false } as const;

export function forYouEngine(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  orchestratorThreadId: string | null,
): ForYouEngine {
  return {
    message: async (text) => {
      if (orchestratorThreadId === null) return "Start this board's orchestrator before answering.";
      // The shell row carries the orchestrator's modes, so the phone need not stream its thread.
      const thread = registry
        .get(environmentSnapshot(environmentId))
        ?.threads.find((row) => row.id === orchestratorThreadId);
      if (thread === undefined)
        return "The orchestrator has not loaded yet. Try again in a moment.";
      const result = await runAtomCommand(
        registry,
        startTurn,
        {
          environmentId,
          input: {
            threadId: thread.id,
            message: {
              messageId: MessageId.make(ExpoCrypto.randomUUID()),
              role: "user",
              text,
              attachments: [],
            },
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
          },
        },
        quiet,
      );
      return result._tag === "Success" ? null : commandError(result).message;
    },
    respondApproval: async (request, decision) => {
      const result = await runAtomCommand(
        registry,
        respondApproval,
        {
          environmentId,
          input: {
            threadId: ThreadId.make(request.threadId),
            requestId: RuntimeRequestId.make(request.id),
            decision,
          },
        },
        quiet,
      );
      return result._tag === "Success" ? null : commandError(result).message;
    },
    trackerCall: async (call) => {
      switch (call.operation) {
        case "create": {
          const result = await runAtomCommand(
            registry,
            issues.create,
            { environmentId, input: call.input },
            quiet,
          );
          if (result._tag !== "Success") throw commandError(result);
          return `Created ${result.value.displayKey}: ${result.value.url}`;
        }
        case "setState": {
          const result = await runAtomCommand(
            registry,
            issues.setState,
            { environmentId, input: call.input },
            quiet,
          );
          if (result._tag !== "Success") throw commandError(result);
          return `Moved ${call.input.key} to "${call.input.state}"`;
        }
        case "comment": {
          const result = await runAtomCommand(
            registry,
            issues.comment,
            { environmentId, input: call.input },
            quiet,
          );
          if (result._tag !== "Success") throw commandError(result);
          return `Commented on ${call.input.key}`;
        }
      }
    },
  };
}
