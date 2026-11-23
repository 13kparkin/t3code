import { useTicketReadiness } from "../state/prStatus";
import { PrChecks } from "./PrChecks";
import { ReadinessChecklist } from "./ReadinessChecklist";
import type { SectionProps } from "./sectionProps";

/** A ticket's merge-ready conditions, with how many hold, and its pull request's checks. */
export function TicketReadiness({ view }: SectionProps) {
  const conditions = useTicketReadiness(view) ?? [];
  const met = conditions.filter((condition) => condition.met).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted">
        {met} of {conditions.length} met
      </p>
      <ReadinessChecklist conditions={conditions} />
      <PrChecks view={view} />
    </div>
  );
}
