import { RootChanges } from "../changes/RootChanges";
import { trimSlashes } from "../files/target";
import { usePrContext } from "../state/prStatus";
import type { SectionProps } from "./sectionProps";

/** The ticket worktree's changes and commits. */
export function TicketSource({ environmentId, view }: SectionProps) {
  const { orchestratorThreadId } = usePrContext();
  const { ticket } = view;
  if (ticket.worktreePath == null) return <p className="text-faint">No worktree yet</p>;
  return (
    <RootChanges
      key={ticket.worktreePath}
      environmentId={environmentId}
      root={{
        cwd: trimSlashes(ticket.worktreePath),
        label: `${ticket.key} worktree`,
        base: ticket.base ?? null,
      }}
      orchestratorThreadId={orchestratorThreadId === "" ? null : orchestratorThreadId}
    />
  );
}
