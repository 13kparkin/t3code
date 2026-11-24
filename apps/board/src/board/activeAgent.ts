import type { AgentView } from "../state/boardModel";

const LIVE = new Set<AgentView["runState"]>(["working", "waiting"]);

export const activeAgentOf = (agents: ReadonlyArray<AgentView>): AgentView | undefined =>
  agents
    .filter((agent) => LIVE.has(agent.runState))
    .reduce<AgentView | undefined>(
      (newest, agent) =>
        newest === undefined || agent.updatedAt > newest.updatedAt ? agent : newest,
      undefined,
    );
