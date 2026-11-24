import { RegistryContext } from "@effect/atom-react";
import { useContext } from "react";

import { chooseTicket } from "../browser/panel";
import { openAgentPage } from "../state/filesView";
import { AgentCard } from "./AgentCard";
import type { SectionProps } from "./sectionProps";

/** Choosing an agent opens its log as a tab over the canvas, and in the Activity section. */
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
            openAgentPage(registry, {
              threadId: entry.threadId,
              label: `${view.ticket.key} ${entry.role}`,
            });
          }}
        />
      ))}
    </div>
  );
}
