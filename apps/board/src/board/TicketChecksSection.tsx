import { TicketChecks } from "../checks/TicketChecks";
import type { SectionProps } from "./sectionProps";

export function TicketChecksSection({ view }: SectionProps) {
  return <TicketChecks view={view} />;
}
