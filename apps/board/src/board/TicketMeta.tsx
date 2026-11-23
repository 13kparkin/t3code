import { GitBranch } from "lucide-react";

import { IssueChip } from "../issues/IssueChip";
import type { TicketView } from "../state/boardModel";
import { usePrContext } from "../state/prStatus";
import { PrChip } from "./PrChip";
import { RemoveWorktree } from "./RemoveWorktree";
import { ReviewChanges } from "./ReviewChanges";

/** Where a ticket's work lives: its branch, its pull request, and its tracker issue. */
export function TicketMeta({
  view,
  onOpenThread,
}: {
  view: TicketView;
  onOpenThread: (threadId: string) => void;
}) {
  const { ticket } = view;
  const kept = usePrContext().keptWorktrees.get(ticket.key);
  const branchText =
    ticket.branch == null
      ? "No branch yet"
      : ticket.base == null
        ? ticket.branch
        : `${ticket.branch} → ${ticket.base}`;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
      <GitBranch className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{branchText}</span>
      <ReviewChanges
        ticket={ticket}
        className="grid size-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
      />
      {(ticket.pr != null ||
        ticket.stage === "pr" ||
        ticket.stage === "awaiting_approval" ||
        ticket.stage === "merged") && <PrChip view={view} />}
      {ticket.stage === "merged" && ticket.worktreePath != null && <RemoveWorktree view={view} />}
      {ticket.issue != null && <IssueChip ticket={ticket} onOpenThread={onOpenThread} />}
      {kept !== undefined && (
        <span data-testid="worktree-kept" className="truncate text-amber-300">
          Kept: {kept}
        </span>
      )}
    </div>
  );
}
