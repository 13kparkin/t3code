import { RegistryContext } from "@effect/atom-react";
import { useContext } from "react";

import { chooseTicket } from "../browser/panel";
import { openAgentPanel } from "../state/agentPanel";
import { AgentCard } from "./AgentCard";
import type { SectionProps } from "./sectionProps";

/** Choosing an agent slides its activity out over the canvas. */
export function TicketAgents({ view, agent }: SectionProps) {
  const registry = useContext(RegistryContext);
  return (
    <div className="flex flex-col gap-1.5">
      {view.agents.map((entry) => (
        <AgentCard
          key={entry.threadId}
          agent={entry}
          ticket={view.ticket}
          selected={entry.threadId === agent?.threadId}
          onOpen={() => {
            chooseTicket(registry, { threadId: entry.threadId, ticketKey: view.ticket.key });
            openAgentPanel(registry, entry.threadId);
          }}
        />
      ))}
    </div>
  );
}
