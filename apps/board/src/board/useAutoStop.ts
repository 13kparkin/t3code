import { RegistryContext } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useContext, useEffect, useRef } from "react";

import type { AgentView } from "../state/boardModel";
import { forceStopThread } from "../state/threads";
import { agentActivity } from "./ticketStatus";

/** T3 releases an idle provider session after this long by itself, so an older agent needs no stop. */
const ENGINE_IDLE_RELEASE_MS = 30 * 60_000;

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
      const activity = agentActivity(agent, now);
      if (
        agent.threadId === orchestratorThreadId ||
        agent.latestRunId === null ||
        (activity !== "stopped" && activity !== "failed") ||
        now - Date.parse(agent.updatedAt) > ENGINE_IDLE_RELEASE_MS
      ) {
        continue;
      }
      const key = `${agent.threadId}:${agent.latestRunId}`;
      if (stopped.current.has(key)) continue;
      stopped.current.add(key);
      void runAtomCommand(
        registry,
        forceStopThread,
        { environmentId, input: { threadId: ThreadId.make(agent.threadId) } },
        { reportFailure: false },
      );
    }
  }, [registry, environmentId, agents, orchestratorThreadId, now]);
}
