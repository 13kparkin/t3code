import { useArtifacts } from "../artifacts/ArtifactsContext";
import { localCiState } from "../domain/readiness";
import { NO_ARTIFACTS } from "../state/artifacts";
import type { TicketView } from "../state/boardModel";
import { useCiLocal } from "../state/prStatus";

/** With no pull request, the ticket's `ci-local.txt` judged on the commit it ran on. */
export function TicketCiLocal({ view }: { view: TicketView }) {
  const { groups } = useArtifacts();
  const file = (groups.byTicket.get(view.ticket.key) ?? NO_ARTIFACTS).find(
    (artifact) => artifact.name === "ci-local.txt",
  );
  const ciLocal = useCiLocal(file, view.ticket.headSha ?? null);
  if (ciLocal === null) return <p className="text-faint">No pull request yet</p>;
  if (ciLocal.kind === "unreadable") return <p className="text-red-300">{ciLocal.reason}</p>;
  const failure = localCiState(ciLocal, ciLocal.headSha);
  return failure === null ? (
    <p className="text-emerald-300">ci-local.txt passed on {ciLocal.headSha.slice(0, 7)}</p>
  ) : (
    <p className="text-red-300">{failure}</p>
  );
}
