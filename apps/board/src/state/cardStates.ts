import * as Record from "effect/Record";

import type { StageLane } from "../board/layout";
import { hasFinished, isWorking } from "../board/ticketStatus";
import type { CallEvent, CardState, FreeAgent } from "../domain/board";
import type { AgentView, BoardModel } from "./boardModel";

export interface ArchivedCard {
  readonly key: string;
  readonly label: string;
}

export interface CardSplit {
  /** The model without archived tickets. */
  readonly model: BoardModel;
  /** Ticketless agents by the lane `agentLane` gives them. */
  readonly agents: Readonly<Record<StageLane, ReadonlyArray<AgentView>>>;
  /** Free agents still on the canvas. */
  readonly free: ReadonlyArray<FreeAgent>;
  /** Free agents the user moved to Done. */
  readonly doneFree: ReadonlyArray<FreeAgent>;
  readonly archived: ReadonlyArray<ArchivedCard>;
}

export const freeAgentLabel = (threadId: string) => `Agent ${threadId.slice(-8)}`;

/** A ticketless agent's lane, by a ticket card's rule. Done or archived by the user wins, and a finished run goes to Done unless the user moved it out. */
export function agentLane(
  agent: AgentView,
  state: CardState | undefined,
  now: number,
): StageLane | "archived" {
  if (state === "done" || state === "archived") return state;
  if (isWorking([agent], now)) return "running";
  if (state === undefined && hasFinished(agent, now)) return "done";
  return agent.latestRunId === null ? "todo" : "waiting";
}

/** Sorts the board's cards by the state the user gave them in `board.json`, and ticketless agents by `agentLane`. */
export function splitCards(
  model: BoardModel,
  freeAgents: ReadonlyArray<FreeAgent>,
  states: Readonly<{ [key: string]: CardState }>,
  now: number,
): CardSplit {
  const inLane = (lane: StageLane | "archived") => (agent: AgentView) =>
    agentLane(agent, states[agent.threadId], now) === lane;
  const tickets = Object.values(model.lanes).flat();
  const archived: ArchivedCard[] = [
    ...tickets
      .filter((view) => states[view.ticket.key] === "archived")
      .map((view) => ({ key: view.ticket.key, label: `${view.ticket.key} ${view.ticket.title}` })),
    ...model.unassigned
      .filter(inLane("archived"))
      .map((agent) => ({ key: agent.threadId, label: agent.title })),
    ...freeAgents
      .filter((agent) => states[agent.threadId] === "archived")
      .map((agent) => ({ key: agent.threadId, label: freeAgentLabel(agent.threadId) })),
  ];
  return {
    model: {
      ...model,
      lanes: Record.map(model.lanes, (views) =>
        views.filter((view) => states[view.ticket.key] !== "archived"),
      ),
    },
    agents: {
      todo: model.unassigned.filter(inLane("todo")),
      running: model.unassigned.filter(inLane("running")),
      waiting: model.unassigned.filter(inLane("waiting")),
      done: model.unassigned.filter(inLane("done")),
    },
    free: freeAgents.filter((agent) => states[agent.threadId] === undefined),
    doneFree: freeAgents.filter((agent) => states[agent.threadId] === "done"),
    archived,
  };
}

/** Each lane's agent rows. Done also lists the free agents moved there. */
export const agentRowCounts = ({ agents, doneFree }: Pick<CardSplit, "agents" | "doneFree">) => ({
  ...Record.map(agents, (rows) => rows.length),
  done: agents.done.length + doneFree.length,
});

/** Archived calls, and the files, folders, and take files archived from the Artifacts area, each by its name. */
export const archivedBesideLanes = (
  calls: ReadonlyArray<CallEvent>,
  states: { readonly [key: string]: CardState },
): ReadonlyArray<ArchivedCard> => [
  ...calls
    .filter((call) => states[call.id] === "archived")
    .map((call) => ({ key: call.id, label: call.title })),
  ...Object.keys(states)
    .filter((key) => states[key] === "archived" && /^(file|dir|take):/.test(key))
    .map((key) => ({
      key,
      label: key.slice(Math.max(key.indexOf(":"), key.lastIndexOf("/")) + 1),
    })),
];

/** Whether a folder, or a folder it sits in, was archived from the Artifacts area, which hides its section. */
export const folderArchived = (states: { readonly [key: string]: CardState }, path: string) =>
  path
    .split("/")
    .some((_, at, parts) => states[`dir:${parts.slice(0, at + 1).join("/")}`] === "archived");
