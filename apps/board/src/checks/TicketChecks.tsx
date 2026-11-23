import type { TicketView } from "../state/boardModel";
import { usePrContext, useTicketPr } from "../state/prStatus";
import { PrView } from "./PrView";

/** A ticket's pull request: its header and action, its checks, and its comments. */
export function TicketChecks({ view }: { view: TicketView }) {
  const { project } = usePrContext();
  const { ref, key, live, now } = useTicketPr(view);
  if (ref === null || key === null) return <p className="text-faint">No pull request yet</p>;
  return (
    <PrView key={key} environmentId={project.environmentId} reference={ref} live={live} now={now} />
  );
}
