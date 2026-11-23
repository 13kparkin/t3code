import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useContext } from "react";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import { chooseTicket, markTicketPainted, ticketChoiceAtom } from "../browser/panel";
import { EmptyFiles } from "../files/EmptyFiles";
import { NO_ARTIFACTS } from "../state/artifacts";
import type { BoardModel } from "../state/boardModel";
import { foldedAtom, sectionKey, toggleFolded } from "../state/boardUi";
import { AgentLog } from "./AgentLog";
import { SectionBar } from "./SectionBar";
import { TicketMeta } from "./TicketMeta";
import { TicketSection } from "./TicketSection";
import { TICKET_SECTIONS } from "./ticketSections";

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
}: {
  environmentId: EnvironmentId;
  model: BoardModel;
}) {
  const registry = useContext(RegistryContext);
  const choice = useAtomValue(ticketChoiceAtom);
  const { groups } = useArtifacts();
  const folded = useAtomValue(foldedAtom);
  const toggle = (id: string) => void toggleFolded(registry, sectionKey(id));
  // A new function each render, so the frame after every render marks a pending open as painted.
  const markPainted = (element: HTMLElement | null) => {
    if (element !== null) requestAnimationFrame(() => markTicketPainted());
  };
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
  const sections = props === null ? [] : TICKET_SECTIONS.filter((section) => section.shows(props));
  const open = sections.filter((section) => !folded.has(sectionKey(section.id)));
  const bars = sections.filter((section) => folded.has(sectionKey(section.id)));
  const filler = open.find((section) => section.fill === true);
  return (
    <div ref={markPainted} className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-3 py-2.5">
        <h3 className="truncate font-semibold">
          {view === undefined ? "Unassigned" : `${view.ticket.key} ${view.ticket.title}`}
        </h3>
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
          <AgentLog key={agent.threadId} environmentId={environmentId} agent={agent} />
        )
      ) : (
        <>
          <div
            className={`overflow-y-auto ${filler === undefined ? "min-h-0 flex-1" : "max-h-[50%] shrink-0"}`}
          >
            {open
              .filter((section) => section !== filler)
              .map(({ id, title, Body }) => (
                <TicketSection key={id} title={title} fill={false} onCollapse={() => toggle(id)}>
                  <Body {...props} />
                </TicketSection>
              ))}
          </div>
          {filler !== undefined && (
            <TicketSection title={filler.title} fill onCollapse={() => toggle(filler.id)}>
              <filler.Body {...props} />
            </TicketSection>
          )}
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
