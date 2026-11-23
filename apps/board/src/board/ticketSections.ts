import type { ComponentType } from "react";

import type { SectionProps } from "./sectionProps";
import { TicketActivity } from "./TicketActivity";
import { TicketAgents } from "./TicketAgents";
import { TicketEvidence } from "./TicketEvidence";
import { TicketReadiness } from "./TicketReadiness";
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
    shows: ({ view }) => view.ticket.summary != null,
    Body: TicketSummary,
  },
  { id: "why", title: "Why", shows: ({ view }) => view.ticket.why != null, Body: TicketWhy },
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
  {
    id: "evidence",
    title: "Evidence",
    shows: ({ artifacts }) => artifacts.length > 0,
    Body: TicketEvidence,
  },
  {
    id: "activity",
    title: "Activity",
    shows: ({ agent }) => agent !== null,
    Body: TicketActivity,
    fill: true,
  },
];
