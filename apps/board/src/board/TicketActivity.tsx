import { AgentLog } from "./AgentLog";
import type { SectionProps } from "./sectionProps";

export function TicketActivity({ environmentId, agent }: SectionProps) {
  if (agent === null) return null;
  return <AgentLog key={agent.threadId} environmentId={environmentId} agent={agent} />;
}
