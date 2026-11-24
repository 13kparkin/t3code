import type { AgentView } from "../state/boardModel";

const LIVE = new Set<AgentView["runState"]>(["working", "waiting"]);

/** The agent that is running now on a ticket, newest first, or undefined when none is. */
export const activeAgentOf = (agents: ReadonlyArray<AgentView>): AgentView | undefined =>
  agents
    .filter((agent) => LIVE.has(agent.runState))
    .reduce<AgentView | undefined>(
      (newest, agent) =>
        newest === undefined || agent.updatedAt > newest.updatedAt ? agent : newest,
      undefined,
    );
