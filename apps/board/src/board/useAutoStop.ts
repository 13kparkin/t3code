import { RegistryContext } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { useContext, useEffect, useRef } from "react";

import type { AgentView } from "../state/boardModel";
import { threadProjection } from "../state/orchestrator";
import { forceStopThread } from "../state/threads";
import { hasLiveSession, shouldAutoStop } from "./ticketStatus";

/**
 * Ends the provider session of each card's agent that runs no turn and waits on nothing, once per
 * run, instead of leaving it for T3's idle timeout. Sending the agent a message starts a new session.
 */
export function useAutoStop(
  environmentId: EnvironmentId,
  agents: ReadonlyArray<AgentView>,
  orchestratorThreadId: string | null,
  now: number,
) {
  const registry = useContext(RegistryContext);
  const stopped = useRef(new Set<string>());
  useEffect(() => {
    for (const agent of agents) {
      if (agent.latestRunId === null || !shouldAutoStop(agent, orchestratorThreadId, now)) continue;
      const key = `${agent.threadId}:${agent.latestRunId}`;
      if (stopped.current.has(key)) continue;
      stopped.current.add(key);
      const threadId = ThreadId.make(agent.threadId);
      const runId = RunId.make(agent.latestRunId);
      // A session the engine already released, or another client stopped, leaves the projection.
      void runAtomCommand(
        registry,
        threadProjection,
        { environmentId, input: { threadId } },
        { reportFailure: false },
      ).then((read) => {
        if (read._tag !== "Success" || !hasLiveSession(read.value.providerSessions)) return;
        // The run id makes the engine refuse the stop once a newer run has started.
        return runAtomCommand(
          registry,
          forceStopThread,
          { environmentId, input: { threadId, runId } },
          { reportFailure: false },
        );
      });
    }
  }, [registry, environmentId, agents, orchestratorThreadId, now]);
}
