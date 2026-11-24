import { RegistryContext } from "@effect/atom-react";
import { useContext, useState } from "react";

import type { Ticket, TicketIssue } from "../domain/ticket";
import type { EditPatch } from "../domain/ticketOverlay";
import { pullTicket } from "../state/issuePull";
import { usePrContext } from "../state/prStatus";
import { editTicket, unlinkTicket } from "../state/ticketEdit";
import { URL_TRACKER } from "../issues/issueLinks";

/** The saves one ticket's details make. `error` is the last failure's text, or null once a save went through. */
export function useTicketActions(ticket: Ticket) {
  const registry = useContext(RegistryContext);
  const { project, folder } = usePrContext();
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    edit: (patch: EditPatch) =>
      editTicket(registry, project, folder, ticket.key, patch).then(setError),
    unlink: () => unlinkTicket(registry, project, folder, ticket.key).then(setError),
    /** Links the ticket, then reads the issue at once so its text shows without waiting for the next round. */
    link: async (issue: TicketIssue) => {
      const failure = await editTicket(registry, project, folder, ticket.key, { issue });
      setError(failure);
      if (failure === null && issue.tracker !== URL_TRACKER) {
        await pullTicket(registry, project, folder, { ...ticket, issue });
      }
    },
  };
}
