import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { X } from "lucide-react";
import { useContext } from "react";

import { chooseTicket } from "../browser/panel";
import { iconButton } from "../browser/styles";
import { agentPanelAtom, closeAgentPanel } from "../state/agentPanel";
import { allAgents, type BoardModel } from "../state/boardModel";
import { AgentLog } from "./AgentLog";

/** The activity of one agent, slid out over the right of the canvas like For you on the left. */
export function AgentPanel({
  environmentId,
  model,
}: {
  environmentId: EnvironmentId;
  model: BoardModel;
}) {
  const registry = useContext(RegistryContext);
  const threadId = useAtomValue(agentPanelAtom);
  const agent = allAgents(model).find((entry) => entry.threadId === threadId);
  if (threadId === null) return null;
  return (
    <aside
      aria-label="Agent activity"
      data-testid="agent-panel"
      className="absolute inset-y-0 right-0 z-30 flex w-96 max-w-full flex-col border-l border-line bg-sidebar shadow-panel"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate font-semibold">
          {agent?.title ?? "Agent activity"}
        </h2>
        {agent?.ticketKey != null && (
          <button
            type="button"
            onClick={() =>
              chooseTicket(registry, { threadId: agent.threadId, ticketKey: agent.ticketKey })
            }
            className="shrink-0 text-[11px] text-muted hover:text-fg"
          >
            Ticket details
          </button>
        )}
        <button
          type="button"
          aria-label="Close agent activity"
          onClick={() => closeAgentPanel(registry)}
          className={iconButton}
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {agent === undefined ? (
        <p className="px-3 py-3 text-faint">This agent is no longer on the board</p>
      ) : (
        <AgentLog key={agent.threadId} environmentId={environmentId} agent={agent} />
      )}
    </aside>
  );
}
