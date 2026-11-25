import { RegistryContext } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { useContext, useEffect, useRef } from "react";

import type { AgentView } from "../state/boardModel";
import { forceStopThread } from "../state/threads";
import { shouldAutoStop } from "./ticketStatus";

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
      // The run id makes the engine refuse the stop once a newer run has started.
      // shortcut: a reload or a second client sends the stop again, which the server handles
      // safely; read the session first if these calls show up in perf traces.
      void runAtomCommand(
        registry,
        forceStopThread,
        {
          environmentId,
          input: {
            threadId: ThreadId.make(agent.threadId),
            runId: RunId.make(agent.latestRunId),
          },
        },
        { reportFailure: false },
      );
    }
  }, [registry, environmentId, agents, orchestratorThreadId, now]);
}
