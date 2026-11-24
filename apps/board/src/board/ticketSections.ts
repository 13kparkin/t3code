import { type ComponentType, createElement } from "react";

import { TicketChecks } from "../checks/TicketChecks";
import type { Addition } from "../domain/additions";
import { missingPlan } from "../domain/ticket";
import { AdditionBlocks } from "./AdditionBlocks";
import type { SectionProps } from "./sectionProps";
import { TicketActivity } from "./TicketActivity";
import { TicketAgents } from "./TicketAgents";
import { Prerequisites } from "./Prerequisites";
import { TicketDetails } from "./TicketDetails";
import { TicketFiles } from "./TicketFiles";
import { TicketGlance } from "./TicketGlance";
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

/** Top to bottom. Collapsed bars stack in this order too. */
export const TICKET_SECTIONS: ReadonlyArray<TicketSection> = [
  {
    id: "summary",
    title: "Summary",
    shows: () => true,
    Body: TicketSummary,
  },
  { id: "why", title: "Why", shows: () => true, Body: TicketWhy },
  { id: "details", title: "Details", shows: () => true, Body: TicketDetails },
  { id: "prerequisites", title: "Prerequisites", shows: () => true, Body: Prerequisites },
  { id: "glance", title: "At a glance", shows: () => true, Body: TicketGlance },
  {
    id: "steps",
    title: "Steps",
    shows: ({ view }) =>
      (view.ticket.steps ?? []).length > 0 ||
      view.ticket.playbook != null ||
      missingPlan(view.ticket),
    Body: TicketSteps,
  },
  { id: "readiness", title: "Readiness", shows: () => true, Body: TicketReadiness },
  {
    id: "agents",
    title: "Agents",
    shows: ({ view }) => view.agents.length > 0,
    Body: TicketAgents,
  },
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

/** The sections with each `ticket` addition after Readiness, shown on its own ticket only. */
export function ticketSectionsFor(items: ReadonlyArray<Addition>): ReadonlyArray<TicketSection> {
  const added = items.flatMap((item): TicketSection[] =>
    item.place === "ticket"
      ? [
          {
            id: `add:${item.id}`,
            title: item.title,
            shows: ({ view }) => view.ticket.key === item.ticket,
            Body: () => createElement(AdditionBlocks, { item }),
          },
        ]
      : [],
  );
  const at = TICKET_SECTIONS.findIndex((section) => section.id === "readiness") + 1;
  return [...TICKET_SECTIONS.slice(0, at), ...added, ...TICKET_SECTIONS.slice(at)];
}
