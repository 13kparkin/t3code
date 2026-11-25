import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { type MouseEvent, useMemo } from "react";

import type { FreeAgent } from "../domain/board";
import { agentOf, type AgentView, allAgents, type BoardModel } from "../state/boardModel";
import { useDriverOf } from "../state/family";
import { environmentSnapshotAtom } from "../state/projects";
import { FreeAgentCard } from "./FreeAgentCard";
import { ticketStatus } from "./ticketStatus";
import { useAutoStop } from "./useAutoStop";

/**
 * The free agent cards, and the session stops for every card's agent. A leaf, because it reads the
 * environment's shell snapshot, which changes with every thread in every project.
 */
export function FreeAgents({
  environmentId,
  model,
  all,
  shown,
  orchestratorThreadId,
  now,
  place,
  onMove,
  onMenu,
}: {
  environmentId: EnvironmentId;
  /** Every ticket's and ticketless agent, archived or not. */
  model: BoardModel;
  /** Every free agent, done or archived too. */
  all: ReadonlyArray<FreeAgent>;
  /** The free agents on the canvas. */
  shown: ReadonlyArray<FreeAgent>;
  orchestratorThreadId: string | null;
  now: number;
  /** Where a dropped card lands, off the lanes. */
  place: (at: { x: number; y: number }) => { x: number; y: number };
  onMove: (agent: FreeAgent) => void;
  onMenu: (event: MouseEvent, threadId: string) => void;
}) {
  const driverOf = useDriverOf();
  const shells = useAtomValue(environmentSnapshotAtom(environmentId))?.threads;
  const views = useMemo(() => {
    const ids = new Set(all.map((agent) => agent.threadId));
    return new Map<string, AgentView>(
      (shells ?? [])
        .filter((shell) => ids.has(shell.id))
        .map((shell) => [shell.id, agentOf(shell, driverOf, null)]),
    );
  }, [shells, all, driverOf]);
  const agents = useMemo(() => [...allAgents(model), ...views.values()], [model, views]);
  useAutoStop(environmentId, agents, orchestratorThreadId, now);
  return shown.map((agent) => {
    const view = views.get(agent.threadId);
    return (
      <FreeAgentCard
        key={agent.threadId}
        environmentId={environmentId}
        agent={agent}
        status={ticketStatus(view === undefined ? [] : [view], now)}
        place={place}
        onMove={(at) => onMove({ threadId: agent.threadId, ...at })}
        onMenu={(event) => onMenu(event, agent.threadId)}
      />
    );
  });
}
