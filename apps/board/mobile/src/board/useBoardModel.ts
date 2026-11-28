import { newestAgent, ticketStatus } from "@agent-board/app/board/ticketStatus";
import { parseTickets, type Ticket } from "@agent-board/app/domain/ticket";
import { joinBoard } from "@agent-board/app/state/boardModel";
import { splitCards } from "@agent-board/app/state/cardStates";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import * as Result from "effect/Result";
import { useMemo, useState } from "react";

import { familyThreadsAtom, inFamily, useFamilyMount } from "./family";
import { type BoardChoice, useBoardFiles } from "./files";

// An agent waiting on its children turns Idle after a few minutes, so the cards recheck each minute.
const clockAtom = Atom.make((get): number => {
  const timer = setInterval(() => get.refreshSelf(), 60_000);
  get.addFinalizer(() => clearInterval(timer));
  return Date.now();
}).pipe(Atom.withLabel("phone-board-clock"));

const NO_TICKETS: ReadonlyArray<Ticket> = [];

/** The board the desktop draws, from the files and the orchestrator's thread family, with the last valid tickets kept. */
export function useBoardModel(choice: BoardChoice) {
  const files = useBoardFiles(choice.key);
  const ticketsText = files?.tickets ?? null;
  const parsed = useMemo(
    () => (ticketsText === null ? Result.succeed(NO_TICKETS) : parseTickets(ticketsText)),
    [ticketsText],
  );
  const [lastValid, setLastValid] = useState(NO_TICKETS);
  if (Result.isSuccess(parsed) && parsed.success !== lastValid) setLastValid(parsed.success);
  const tickets = Result.isSuccess(parsed) ? parsed.success : lastValid;
  const board = choice.listed.ok ? choice.listed.board : null;
  const rootId = board?.orchestratorThreadId ?? null;
  useFamilyMount(rootId);
  const threads = useAtomValue(familyThreadsAtom(choice.project.environmentId));
  const now = useAtomValue(clockAtom);
  const split = useMemo(() => {
    if (rootId !== null && threads === undefined) return null;
    const model = joinBoard({
      tickets,
      family: rootId === null ? [] : (threads ?? []).filter((thread) => inFamily(thread, rootId)),
      orchestratorThreadId: rootId ?? "",
      driverOf: () => null,
    });
    return splitCards(model, board?.freeAgents ?? [], board?.cardStates ?? {}, now);
  }, [tickets, threads, rootId, board, now]);
  return {
    files,
    failure: Result.isFailure(parsed) ? parsed.failure : null,
    tickets,
    split,
    now,
  };
}

export const cardStatus = (agents: Parameters<typeof ticketStatus>[0], now: number) => ({
  status: ticketStatus(agents, now),
  newest: newestAgent(agents),
});
