import { RegistryContext } from "@effect/atom-react";
import { useContext, useState } from "react";

import type { Ticket, TicketIssue } from "../domain/ticket";
import type { Edits } from "../domain/ticketOverlay";
import { pullTicket } from "../state/issuePull";
import { usePrContext } from "../state/prStatus";
import { editTicket, unlinkTicket } from "../state/ticketEdit";
import { URL_TRACKER } from "../issues/issueLinks";

export function useTicketActions(ticket: Ticket) {
  const registry = useContext(RegistryContext);
  const { project, folder } = usePrContext();
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    edit: (patch: Edits) => editTicket(registry, project, folder, ticket.key, patch).then(setError),
    unlink: () => unlinkTicket(registry, project, folder, ticket.key).then(setError),
    link: async (issue: TicketIssue) => {
      const failure = await editTicket(registry, project, folder, ticket.key, { issue });
      setError(failure);
      if (failure === null && issue.tracker !== URL_TRACKER) {
        await pullTicket(registry, project, folder, { ...ticket, issue });
      }
    },
  };
}
