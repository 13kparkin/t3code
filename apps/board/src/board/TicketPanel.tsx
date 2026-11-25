import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Maximize2 } from "lucide-react";
import { useContext, useMemo } from "react";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import {
  chooseTicket,
  markTicketPainted,
  setPanelTab,
  ticketChoiceAtom,
  ticketTabShownAtom,
} from "../browser/panel";
import { iconButton } from "../browser/styles";
import { filesViewAtom, openTicketPage } from "../state/filesView";
import { Tooltip } from "../ui/Tooltip";
import { EmptyFiles } from "../files/EmptyFiles";
import { NO_ARTIFACTS } from "../state/artifacts";
import type { BoardModel } from "../state/boardModel";
import { foldedAtom, sectionKey, toggleFolded } from "../state/boardUi";
import { usePrContext } from "../state/prStatus";
import { AgentLog } from "./AgentLog";
import { SectionBar } from "./SectionBar";
import { TicketTitle } from "./TicketTitle";
import { TicketMeta } from "./TicketMeta";
import { TicketSection } from "./TicketSection";
import { ticketSectionsFor } from "./ticketSections";

const STATE_LABEL = {
  working: "Working",
  waiting: "Waiting",
  idle: "Idle",
  failed: "Failed",
  stopped: "Stopped",
} as const;

/** The Ticket tab: a ticket's details as collapsible sections, or the log of an agent no ticket claims. The board's screen draws it into the panel. */
export function TicketPanel({
  environmentId,
  model,
  page = false,
}: {
  environmentId: EnvironmentId;
  model: BoardModel;
  /** Drawn as the main view's full-page tab, not in the side panel. */
  page?: boolean;
}) {
  const registry = useContext(RegistryContext);
  const choice = useAtomValue(ticketChoiceAtom);
  const { groups } = useArtifacts();
  const folded = useAtomValue(foldedAtom);
  const shown = useAtomValue(ticketTabShownAtom);
  const onPage = useAtomValue(filesViewAtom).surface === "ticket";
  const { additions } = usePrContext();
  const allSections = useMemo(() => ticketSectionsFor(additions), [additions]);
  const toggle = (id: string) => void toggleFolded(registry, sectionKey(id));
  // A new function each render, so the frame after every render marks a pending open as painted.
  const markPainted = (element: HTMLElement | null) => {
    if (element !== null) requestAnimationFrame(() => markTicketPainted());
  };
  if (!page && !shown) return null;
  if (!page && onPage) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyFiles>Open on the page</EmptyFiles>
      </div>
    );
  }
  const view =
    choice === null
      ? undefined
      : Object.values(model.lanes)
          .flat()
          .find(
            (entry) =>
              entry.ticket.key === choice.ticketKey ||
              entry.agents.some((agent) => agent.threadId === choice.threadId),
          );
  const agent =
    choice === null
      ? null
      : ([...(view?.agents ?? []), ...model.unassigned].find(
          (a) => a.threadId === choice.threadId,
        ) ?? null);
  if (view === undefined && agent === null) {
    return (
      <div ref={markPainted} className="flex min-h-0 flex-1 flex-col">
        <EmptyFiles>Select a ticket or agent card</EmptyFiles>
      </div>
    );
  }
  const props =
    view === undefined
      ? null
      : {
          environmentId,
          view,
          agent,
          artifacts: groups.byTicket.get(view.ticket.key) ?? NO_ARTIFACTS,
        };
  const sections = props === null ? [] : allSections.filter((section) => section.shows(props));
  const open = sections.filter((section) => !folded.has(sectionKey(section.id)));
  const bars = sections.filter((section) => folded.has(sectionKey(section.id)));
  return (
    <div ref={markPainted} className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          {view === undefined ? (
            <h3 className="min-w-0 flex-1 truncate font-semibold">Unassigned</h3>
          ) : (
            <TicketTitle ticket={view.ticket} />
          )}
          {!page && (
            <Tooltip text="Open full page" side="bottom" align="end">
              <button
                type="button"
                aria-label="Open full page"
                onClick={() => {
                  openTicketPage(registry);
                  // The page already shows the details.
                  setPanelTab(registry, "chat");
                }}
                className={iconButton}
              >
                <Maximize2 className="size-3.5" aria-hidden />
              </button>
            </Tooltip>
          )}
        </div>
        {view !== undefined && (
          <TicketMeta
            view={view}
            onOpenThread={(threadId) =>
              chooseTicket(registry, { threadId, ticketKey: view.ticket.key })
            }
          />
        )}
        {agent !== null && (
          <p className="text-[11px] text-muted">
            {agent.role} · {STATE_LABEL[agent.runState]}
          </p>
        )}
      </header>
      {props === null ? (
        agent !== null && (
          <AgentLog
            key={agent.threadId}
            environmentId={environmentId}
            threadId={agent.threadId}
            role={agent.role}
          />
        )
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {open.map(({ id, title, Body }) => (
              <TicketSection key={id} title={title} onCollapse={() => toggle(id)}>
                <Body {...props} />
              </TicketSection>
            ))}
          </div>
        </>
      )}
      {bars.length > 0 && (
        <footer className="shrink-0">
          {bars.map(({ id, title }) => (
            <SectionBar key={id} title={title} onExpand={() => toggle(id)} />
          ))}
        </footer>
      )}
    </div>
  );
}
