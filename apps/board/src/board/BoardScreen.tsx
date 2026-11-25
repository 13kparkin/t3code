import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { TriangleAlert } from "lucide-react";
import { type MouseEvent, useContext, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ArtifactsProvider } from "../artifacts/ArtifactsContext";
import { useBoardArtifacts } from "../artifacts/useBoardArtifacts";
import { chatSlotAtom, chooseTicket, ticketChoiceAtom, ticketSlotAtom } from "../browser/panel";
import { OrchestratorPanel } from "../chat/OrchestratorPanel";
import { MainTabs } from "../files/MainTabs";
import { visibleAdditions } from "../domain/additions";
import type { CardState, FreeAgent } from "../domain/board";
import { mergeTicketKey } from "../domain/readiness";
import { applyThreadShown, threadKey, threadShownAtom } from "../state/chatThread";
import { filterFlipsAtom, frameOrderAtom } from "../state/boardUi";
import { useDriverOf, useThreadFamily } from "../state/family";
import { clockAtom, PrProvider } from "../state/prStatus";
import { environmentSnapshotAtom } from "../state/projects";
import { focusedCardAtom, useBoardForYou } from "../state/forYou";
import { addDocs } from "../state/attachmentUploads";
import { agentOf, type AgentView, allAgents, countBuilders } from "../state/boardModel";
import { ticketStatus } from "./ticketStatus";
import { useAutoStop } from "./useAutoStop";
import { useBoardView } from "../state/boardView";
import { issuePullAtom } from "../state/issuePull";
import { keptWorktreesAtom } from "../state/mergeCleanup";
import { setHiddenAdditions } from "../state/reviews";
import type { ValidBoard } from "../store/boardFiles";
import { openAgentPanel } from "../state/agentPanel";
import { moveFreeAgent, setCardState, startFreeAgent } from "../state/boardCards";
import { splitCards } from "../state/cardStates";
import { ContextMenu } from "../ui/ContextMenu";
import type { PopMenuItem } from "../ui/MenuList";
import { FREE_CARD, FreeAgentCard } from "./FreeAgentCard";
import { AgentPanel } from "./AgentPanel";
import { ForYouLane } from "./ForYouLane";
import { ForYouPage } from "./ForYouPage";
import { Lanes } from "./Lanes";
import { forYouHeight, hiddenFilters, layoutBoard, withCards } from "./layout";
import { OrchestratorCard } from "./OrchestratorCard";
import { TicketPanel } from "./TicketPanel";
import { useStoreErrorReports } from "./useStoreErrorReports";
import { Viewport } from "./Viewport";

const NO_ORDER = {};
const NO_IDS: ReadonlyArray<string> = [];
const NO_STATES: Readonly<{ [key: string]: CardState }> = {};
const NO_FREE: ReadonlyArray<FreeAgent> = [];

interface CardMenu {
  readonly at: { readonly x: number; readonly y: number };
  readonly label: string;
  readonly items: ReadonlyArray<PopMenuItem>;
}

/** A leaf, so the orchestrator's streaming state re-renders only this and not the board. */
function StoreErrorReports(props: Parameters<typeof useStoreErrorReports>[0]) {
  useStoreErrorReports(props);
  return null;
}

/** A board's orchestrator card and lanes on the canvas, the ticket tab and the orchestrator's chat, which draw in the side panel. Open files are tabs over the canvas. */
export function BoardScreen({
  project,
  listed,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
}) {
  const registry = useContext(RegistryContext);
  const stored = useAtomValue(threadShownAtom)[threadKey(project.id, listed.folder)] ?? false;
  useLayoutEffect(() => applyThreadShown(registry, stored), [registry, stored]);
  const [dropError, setDropError] = useState<string | null>(null);
  const [hideError, setHideError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [menu, setMenu] = useState<CardMenu | null>(null);
  const { board } = listed;
  const {
    model: fullModel,
    issue,
    stats,
    decisions,
    additions,
    overlay,
  } = useBoardView(project, listed);
  const cardStates = board.cardStates ?? NO_STATES;
  const freeAgents = board.freeAgents ?? NO_FREE;
  const cards = useMemo(
    () => splitCards(fullModel, freeAgents, cardStates),
    [fullModel, freeAgents, cardStates],
  );
  const { model } = cards;
  const now = useAtomValue(clockAtom);
  const driverOf = useDriverOf();
  const shells = useAtomValue(environmentSnapshotAtom(project.environmentId))?.threads;
  const freeViews = useMemo(() => {
    const ids = new Set(freeAgents.map((agent) => agent.threadId));
    return new Map<string, AgentView>(
      (shells ?? [])
        .filter((shell) => ids.has(shell.id))
        .map((shell) => [shell.id, agentOf(shell, driverOf, null)]),
    );
  }, [shells, freeAgents, driverOf]);
  const cardAgents = useMemo(
    () => [...allAgents(fullModel), ...freeViews.values()],
    [fullModel, freeViews],
  );
  useAutoStop(project.environmentId, cardAgents, board.orchestratorThreadId, now);
  const saveCard = (key: string, state: CardState | null) =>
    void setCardState(registry, project, listed, key, state).then(setCardError);
  const openCardMenu = (event: MouseEvent, key: string, label: string, ticket: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    const state = cardStates[key];
    setMenu({
      at: { x: event.clientX, y: event.clientY },
      label: `${label} actions`,
      items: [
        ...(ticket
          ? []
          : [
              state === "done"
                ? { label: "Move out of Done", onSelect: () => saveCard(key, null) }
                : { label: "Move to Done", onSelect: () => saveCard(key, "done") },
            ]),
        { label: "Archive", onSelect: () => saveCard(key, "archived") },
      ],
    });
  };
  useAtomValue(issuePullAtom(`${project.id}/${listed.folder}`));
  const hiddenAdditions = board.hiddenAdditions ?? NO_IDS;
  const visible = useMemo(
    () => visibleAdditions(additions, hiddenAdditions),
    [additions, hiddenAdditions],
  );
  // Only ids still in the file are written, so the list cannot grow past the file.
  const changeHidden = (change: (ids: ReadonlyArray<string>) => ReadonlyArray<string>) =>
    void setHiddenAdditions(registry, project, listed, (ids) =>
      change(ids).filter((id) => additions.some((item) => item.id === id)),
    ).then(setHideError);
  const order = useAtomValue(frameOrderAtom)[board.id] ?? NO_ORDER;
  const forYou = useBoardForYou(project, listed);
  const artifacts = useBoardArtifacts(project, listed, fullModel);
  const flips = useAtomValue(filterFlipsAtom(board.id));
  const hidden = useMemo(() => hiddenFilters(new Set(flips.split(",")), visible), [flips, visible]);
  const doneCount = cards.done.agents.length + cards.done.free.length;
  const layout = useMemo(() => {
    const laid = layoutBoard(
      model,
      order,
      forYouHeight(forYou.views),
      hidden,
      visible,
      stats.problems.length,
      doneCount,
      now,
    );
    return { ...laid, content: withCards(laid.content, cards.free, FREE_CARD) };
  }, [
    model,
    order,
    forYou.views,
    hidden,
    visible,
    stats.problems.length,
    doneCount,
    cards.free,
    now,
  ]);
  const family = useThreadFamily(project.environmentId, board.orchestratorThreadId);
  const builders = useMemo(() => countBuilders(fullModel), [fullModel]);
  const tickets = useMemo(() => Object.values(fullModel.lanes).flat(), [fullModel]);
  const keptWorktrees = useAtomValue(keptWorktreesAtom(`${project.id}/${listed.folder}`));
  const prContext = useMemo(() => {
    const keys = tickets.map((view) => view.ticket.key);
    const mergeOrderNotes = new Map<string, string>();
    // Cards run oldest first, so a later approval for a ticket replaces an earlier one.
    for (const { card } of forYou.views) {
      if (card.origin !== "file" || card.item.kind !== "merge_approval") continue;
      const key = mergeTicketKey(card.item, keys);
      const note = card.item.conditions.parent_ready.note;
      if (key !== null && note != null) mergeOrderNotes.set(key, note);
    }
    return {
      project,
      folder: listed.folder,
      orchestratorThreadId: board.orchestratorThreadId ?? "",
      family,
      tickets,
      mergeOrderNotes,
      keptWorktrees,
      decisions,
      additions: visible,
      overlay,
    };
  }, [
    project,
    listed.folder,
    board.orchestratorThreadId,
    family,
    tickets,
    forYou.views,
    keptWorktrees,
    decisions,
    visible,
    overlay,
  ]);
  const chatSlot = useAtomValue(chatSlotAtom);
  const ticketSlot = useAtomValue(ticketSlotAtom);
  const choice = useAtomValue(ticketChoiceAtom);
  const focused = useAtomValue(focusedCardAtom);
  const focusedId =
    focused?.boardId === board.id && forYou.views.some((view) => view.card.id === focused.cardId)
      ? focused.cardId
      : null;
  return (
    <ArtifactsProvider value={artifacts}>
      <PrProvider value={prContext}>
        <div className="relative flex h-full min-h-0">
          <StoreErrorReports
            environmentId={project.environmentId}
            orchestratorThreadId={board.orchestratorThreadId}
            boardId={board.id}
            errors={[
              ...(issue === null ? [] : [issue.message]),
              ...stats.problems,
              ...forYou.problems.map(
                (problem) => `foryou.jsonl line ${problem.line}: ${problem.message}`,
              ),
            ]}
          />
          <AgentPanel
            environmentId={project.environmentId}
            model={fullModel}
            freeAgents={freeAgents}
          />
          <MainTabs
            files={artifacts.files}
            ticketPage={
              <TicketPanel environmentId={project.environmentId} model={fullModel} page />
            }
            cardPage={<ForYouPage project={project} listed={listed} forYou={forYou} />}
          >
            <Viewport
              content={layout.content}
              onDropFiles={(files) =>
                void addDocs(registry, project, listed, files).then(setDropError)
              }
              onEmptyMenu={(screen, point) =>
                setMenu({
                  at: screen,
                  label: "Canvas actions",
                  items: [
                    {
                      label: "Start agent",
                      onSelect: () =>
                        void startFreeAgent(registry, project, listed, point).then(setCardError),
                    },
                  ],
                })
              }
            >
              <OrchestratorCard
                project={project}
                listed={listed}
                stats={{ ...stats, forYouOpen: forYou.open }}
                builders={builders}
                hidden={hidden}
                additions={additions}
                onChangeHidden={changeHidden}
                doneCount={doneCount + model.lanes.merged.length + model.lanes.off_path.length}
                archived={cards.archived}
                onUnarchive={(key) => saveCard(key, null)}
              />
              <Lanes
                layout={layout}
                model={model}
                boardId={board.id}
                forYouOpen={forYou.open}
                queued={builders >= stats.builderCap}
                forYouLane={
                  <ForYouLane
                    project={project}
                    listed={listed}
                    forYou={forYou}
                    focusedId={focusedId}
                  />
                }
                choice={choice}
                onChoose={(next) => chooseTicket(registry, next)}
                onOpenAgent={(threadId, ticketKey) => {
                  registry.set(ticketChoiceAtom, { threadId, ticketKey });
                  openAgentPanel(registry, threadId);
                }}
                onRemoveAddition={(id) => changeHidden((ids) => [...ids, id])}
                done={cards.done}
                onCardMenu={openCardMenu}
                now={now}
              />
              {cards.free.map((agent) => {
                const view = freeViews.get(agent.threadId);
                return (
                  <FreeAgentCard
                    key={agent.threadId}
                    environmentId={project.environmentId}
                    agent={agent}
                    status={ticketStatus(view === undefined ? [] : [view], now)}
                    onMove={(at) =>
                      void moveFreeAgent(registry, project, listed, {
                        threadId: agent.threadId,
                        ...at,
                      }).then(setCardError)
                    }
                    onMenu={(event) => openCardMenu(event, agent.threadId, "Agent", false)}
                  />
                );
              })}
            </Viewport>
            <div className="absolute bottom-3.5 left-3.5 z-10 flex max-w-[60%] flex-col gap-2">
              {dropError !== null && (
                <p
                  role="alert"
                  data-testid="drop-error"
                  className="rounded-lg border border-red-400/40 bg-panel px-3 py-2 break-words text-red-300 shadow-panel"
                >
                  {dropError}
                </p>
              )}
              {cardError !== null && (
                <p
                  role="alert"
                  data-testid="card-error"
                  className="rounded-lg border border-red-400/40 bg-panel px-3 py-2 break-words text-red-300 shadow-panel"
                >
                  {cardError}
                </p>
              )}
              {hideError !== null && (
                <p
                  role="alert"
                  data-testid="additions-error"
                  className="rounded-lg border border-red-400/40 bg-panel px-3 py-2 break-words text-red-300 shadow-panel"
                >
                  {hideError}
                </p>
              )}
              {issue !== null && (
                <div
                  role="alert"
                  data-testid="tickets-banner"
                  className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-panel px-3 py-2 text-red-300 shadow-panel"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      tickets.json has a bad {issue.fields.length === 1 ? "field" : "fields"}
                      {issue.fields.length > 0 ? `: ${issue.fields.join(", ")}` : ""}. Showing the
                      last valid layout.
                    </p>
                    <p className="text-[11px] break-words text-red-300/80">{issue.message}</p>
                  </div>
                </div>
              )}
              {forYou.problems.length > 0 && (
                <div
                  role="alert"
                  data-testid="foryou-banner"
                  className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-panel px-3 py-2 text-red-300 shadow-panel"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      foryou.jsonl has a bad {forYou.problems.length === 1 ? "line" : "lines"}:{" "}
                      {forYou.problems.map((problem) => problem.line).join(", ")}. The other cards
                      still show.
                    </p>
                    {forYou.problems.map((problem) => (
                      <p key={problem.line} className="text-[11px] break-words text-red-300/80">
                        Line {problem.line}: {problem.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </MainTabs>
          {menu !== null && (
            <ContextMenu
              at={menu.at}
              label={menu.label}
              items={menu.items}
              onClose={() => setMenu(null)}
            />
          )}
          {chatSlot !== null &&
            createPortal(<OrchestratorPanel project={project} listed={listed} />, chatSlot)}
          {ticketSlot !== null &&
            createPortal(
              <TicketPanel environmentId={project.environmentId} model={fullModel} />,
              ticketSlot,
            )}
        </div>
      </PrProvider>
    </ArtifactsProvider>
  );
}
