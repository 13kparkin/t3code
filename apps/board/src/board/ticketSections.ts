import type { ComponentType } from "react";

import { TicketChecks } from "../checks/TicketChecks";
import type { SectionProps } from "./sectionProps";
import { TicketActivity } from "./TicketActivity";
import { TicketAgents } from "./TicketAgents";
import { TicketFiles } from "./TicketFiles";
import { TicketReadiness } from "./TicketReadiness";
import { TicketSource } from "./TicketSource";
import { TicketSteps } from "./TicketSteps";
import { TicketSummary } from "./TicketSummary";
import { TicketWhy } from "./TicketWhy";

export interface TicketSection {
  readonly id: string;
  readonly title: string;
  /** Whether the ticket has anything for this section. A section with nothing is left out, bar and all. */
  readonly shows: (props: SectionProps) => boolean;
  readonly Body: ComponentType<SectionProps>;
  /** The section takes the panel's spare height. */
  readonly fill?: true;
}

/** A ticket's details, top to bottom. Collapsed sections stack as bars in this order too. A new section is one entry here. */
export const TICKET_SECTIONS: ReadonlyArray<TicketSection> = [
  {
    id: "summary",
    title: "Summary",
    shows: () => true,
    Body: TicketSummary,
  },
  { id: "why", title: "Why", shows: () => true, Body: TicketWhy },
  {
    id: "steps",
    title: "Steps",
    shows: ({ view }) => (view.ticket.steps ?? []).length > 0 || view.ticket.playbook != null,
    Body: TicketSteps,
  },
  { id: "readiness", title: "Readiness", shows: () => true, Body: TicketReadiness },
  {
    id: "agents",
    title: "Agents",
    shows: ({ view }) => view.agents.length > 0,
    Body: TicketAgents,
  },
  // These three always show, with a one-line note when the ticket has no worktree or pull request yet.
  { id: "source", title: "Source control", shows: () => true, Body: TicketSource },
  { id: "checks", title: "Checks", shows: () => true, Body: TicketChecks },
  { id: "files", title: "Files", shows: () => true, Body: TicketFiles },
  {
    id: "activity",
    title: "Activity",
    shows: ({ agent }) => agent !== null,
    Body: TicketActivity,
    fill: true,
  },
];
