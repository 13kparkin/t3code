import { useAtomValue } from "@effect/atom-react";

import { agentOf } from "../state/boardModel";
import { useDriverOf } from "../state/family";
import { clockAtom, usePrContext } from "../state/prStatus";
import { orchestratorStatus } from "./ticketStatus";

/** The orchestrator's status word from its row in the board's thread family. */
export function useOrchestratorStatus(threadId: string | null): string {
  const { family } = usePrContext();
  const driverOf = useDriverOf();
  const now = useAtomValue(clockAtom);
  const row = family.find((entry) => entry.id === threadId);
  return orchestratorStatus(
    threadId,
    row === undefined ? undefined : agentOf(row, driverOf, null),
    now,
  );
}
