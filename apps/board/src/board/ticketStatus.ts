import type { AgentView } from "../state/boardModel";

export interface CardStatus {
  readonly word: string;
  /** The dot's colour class. */
  readonly tone: string;
}

/** An agent waiting on its children this long with no change reads as Idle. */
const IDLE_AFTER_MS = 3 * 60_000;

type AgentActivity = "asking" | "working" | "idle" | "failed" | "stopped";

/** What one agent is doing at `now`. */
export function agentActivity(agent: AgentView, now: number): AgentActivity {
  if (agent.pendingRequest) return "asking";
  if (agent.waitingOnChildren) {
    return now - Date.parse(agent.updatedAt) > IDLE_AFTER_MS ? "idle" : "working";
  }
  if (agent.runState === "working" || agent.runState === "waiting") return "working";
  return agent.runState === "failed" ? "failed" : "stopped";
}

/**
 * What a card's agents are doing: a question for the user, then live work, then waiting on
 * children, then the newest agent's state, so a failed agent that another agent has since
 * replaced does not mark the ticket.
 */
export function ticketStatus(agents: ReadonlyArray<AgentView>, now: number): CardStatus | null {
  if (agents.length === 0) return null;
  const activities = new Set(agents.map((agent) => agentActivity(agent, now)));
  if (activities.has("asking")) return { word: "Waiting on you", tone: "bg-amber-400" };
  if (activities.has("working")) return { word: "Working", tone: "bg-sky-400" };
  if (activities.has("idle")) return { word: "Idle", tone: "bg-faint" };
  if (newestAgent(agents)?.runState === "failed") {
    return { word: "Failed", tone: "bg-red-400" };
  }
  return { word: "Stopped", tone: "bg-faint" };
}

/** Whether a card belongs in Running: one of its agents is working. */
export const isWorking = (agents: ReadonlyArray<AgentView>, now: number) =>
  agents.some((agent) => agentActivity(agent, now) === "working");

/** The agent that changed last, which the card's second line names. */
export const newestAgent = (agents: ReadonlyArray<AgentView>): AgentView | undefined =>
  agents.reduce<AgentView | undefined>(
    (newest, agent) =>
      newest === undefined || agent.updatedAt > newest.updatedAt ? agent : newest,
    undefined,
  );
