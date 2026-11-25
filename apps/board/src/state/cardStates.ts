import * as Record from "effect/Record";

import type { CardState, FreeAgent } from "../domain/board";
import type { AgentView, BoardModel } from "./boardModel";

export interface ArchivedCard {
  readonly key: string;
  readonly label: string;
}

export interface CardSplit {
  /** The model without archived tickets, and with only the ticketless agents still on the canvas. */
  readonly model: BoardModel;
  /** Free agents still on the canvas. */
  readonly free: ReadonlyArray<FreeAgent>;
  /** Ticketless agents and free agents the user moved to Done. */
  readonly done: {
    readonly agents: ReadonlyArray<AgentView>;
    readonly free: ReadonlyArray<FreeAgent>;
  };
  readonly archived: ReadonlyArray<ArchivedCard>;
}

export const freeAgentLabel = (threadId: string) => `Agent ${threadId.slice(-8)}`;

/** Sorts the board's cards by the state the user gave them in `board.json`. */
export function splitCards(
  model: BoardModel,
  freeAgents: ReadonlyArray<FreeAgent>,
  states: Readonly<{ [key: string]: CardState }>,
): CardSplit {
  const tickets = Object.values(model.lanes).flat();
  const archived: ArchivedCard[] = [
    ...tickets
      .filter((view) => states[view.ticket.key] === "archived")
      .map((view) => ({ key: view.ticket.key, label: `${view.ticket.key} ${view.ticket.title}` })),
    ...model.unassigned
      .filter((agent) => states[agent.threadId] === "archived")
      .map((agent) => ({ key: agent.threadId, label: agent.title })),
    ...freeAgents
      .filter((agent) => states[agent.threadId] === "archived")
      .map((agent) => ({ key: agent.threadId, label: freeAgentLabel(agent.threadId) })),
  ];
  return {
    model: {
      lanes: Record.map(model.lanes, (views) =>
        views.filter((view) => states[view.ticket.key] !== "archived"),
      ),
      unassigned: model.unassigned.filter((agent) => states[agent.threadId] === undefined),
    },
    free: freeAgents.filter((agent) => states[agent.threadId] === undefined),
    done: {
      agents: model.unassigned.filter((agent) => states[agent.threadId] === "done"),
      free: freeAgents.filter((agent) => states[agent.threadId] === "done"),
    },
    archived,
  };
}
