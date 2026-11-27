import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { openInBrowser } from "../browser/browserTabs";
import { classifyIssueLink, URL_TRACKER } from "../issues/issueLinks";
import { lockedFields } from "../domain/ticketOverlay";
import { pullStatusAtom, pullStatusKey } from "../state/issuePull";
import { usePrContext } from "../state/prStatus";
import { ago } from "../ui/ago";
import type { SectionProps } from "./sectionProps";
import { useTicketActions } from "./useTicketActions";

const TRACKER_NAME = new Map([
  ["linear", "Linear"],
  ["github", "GitHub"],
]);
const button =
  "rounded border border-line px-1.5 leading-5 text-muted hover:bg-hover hover:text-fg";

export function TicketDetails({ view }: SectionProps) {
  const { ticket } = view;
  const { overlay, project, folder } = usePrContext();
  const { link, unlink, error } = useTicketActions(ticket);
  const [typed, setTyped] = useState("");
  const [rejected, setRejected] = useState(false);
  const status = useAtomValue(pullStatusAtom).get(pullStatusKey(project.id, folder, ticket.key));
  const held = lockedFields(ticket).has("description");
  const pulled = overlay[ticket.key]?.pulled;
  const issue = ticket.issue ?? null;
  const tracker = (issue === null ? undefined : TRACKER_NAME.get(issue.tracker)) ?? null;
  const synced = status?.syncedAt ?? pulled?.at ?? null;
  const submit = () => {
    const next = classifyIssueLink(typed);
    setRejected(next === null);
    if (next === null) return;
    setTyped("");
    void link(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <p data-testid="ticket-description" className="break-words whitespace-pre-wrap text-fg">
        {ticket.description === undefined || ticket.description === ""
          ? "No description"
          : ticket.description}
      </p>
      {held && tracker !== null && (
        <p data-testid="locked-note" className="text-[11px] text-muted">
          {`Title and description are held by ${tracker}. Prerequisites are kept on the board. `}
          {pulled !== undefined && (
            <button
              type="button"
              className="underline hover:text-fg"
              onClick={() => openInBrowser(pulled.url)}
            >
              {`Edit them in ${tracker}`}
            </button>
          )}
        </p>
      )}
      {held && (
        <p data-testid="sync-note" className="text-[11px] text-faint">
          {status?.error != null
            ? synced === null
              ? `Not synced: ${status.error}`
              : `Last synced ${ago(synced)}, tracker unreachable`
            : synced === null
              ? "Not synced yet"
              : `Synced ${ago(synced)}`}
        </p>
      )}
      {issue === null ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5">
            <input
              data-testid="link-input"
              aria-label="Link to a tracker issue"
              placeholder="Linear key, owner/repo#12, or a link"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setRejected(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              className="min-w-0 flex-1 rounded border border-line bg-transparent px-1.5 leading-5 outline-none focus:border-focus"
            />
            <button type="button" data-testid="link-submit" onClick={submit} className={button}>
              Link
            </button>
          </div>
          {rejected && (
            <p className="text-[11px] text-red-300">That is not a tracker key or a web address.</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-muted" data-testid="linked-to">
            {issue.tracker === URL_TRACKER ? (
              <button
                type="button"
                className="underline hover:text-fg"
                onClick={() => openInBrowser(issue.key)}
              >
                {issue.key}
              </button>
            ) : (
              `Linked to ${issue.key}`
            )}
          </span>
          <button
            type="button"
            data-testid="unlink"
            onClick={() => void unlink()}
            className={button}
          >
            Unlink
          </button>
        </div>
      )}
      {error !== null && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
