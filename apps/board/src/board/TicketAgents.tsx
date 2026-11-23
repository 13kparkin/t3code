import { RegistryContext } from "@effect/atom-react";
import { useContext } from "react";

import { chooseTicket } from "../browser/panel";
import { AgentCard } from "./AgentCard";
import type { SectionProps } from "./sectionProps";

/** The ticket's agents. Choosing one shows its log in the Activity section. */
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
          onOpen={() =>
            chooseTicket(registry, { threadId: entry.threadId, ticketKey: view.ticket.key })
          }
        />
      ))}
    </div>
  );
}
