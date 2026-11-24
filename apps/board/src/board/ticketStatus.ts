import type { AgentView } from "../state/boardModel";

export interface CardStatus {
  readonly word: string;
  /** The dot's colour class. */
  readonly tone: string;
}

/**
 * What a card's agents are doing: a question for the user, then live work, then the newest agent's
 * state, so a failed agent that another agent has since replaced no longer marks the ticket.
 */
export function ticketStatus(agents: ReadonlyArray<AgentView>): CardStatus | null {
  if (agents.length === 0) return null;
  if (agents.some((agent) => agent.pendingRequest)) {
    return { word: "Waiting on you", tone: "bg-amber-400" };
  }
  if (agents.some((agent) => agent.runState === "working" || agent.runState === "waiting")) {
    return { word: "Working", tone: "bg-sky-400" };
  }
  if (newestAgent(agents)?.runState === "failed") {
    return { word: "Failed", tone: "bg-red-400" };
  }
  return { word: "Idle", tone: "bg-faint" };
}

/** The agent that changed last, which the card's second line names. */
export const newestAgent = (agents: ReadonlyArray<AgentView>): AgentView | undefined =>
  agents.reduce<AgentView | undefined>(
    (newest, agent) =>
      newest === undefined || agent.updatedAt > newest.updatedAt ? agent : newest,
    undefined,
  );
