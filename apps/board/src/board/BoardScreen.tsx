import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { TriangleAlert } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ArtifactsProvider } from "../artifacts/ArtifactsContext";
import { useBoardArtifacts } from "../artifacts/useBoardArtifacts";
import { chatSlotAtom, chooseTicket, ticketChoiceAtom, ticketSlotAtom } from "../browser/panel";
import { OrchestratorPanel } from "../chat/OrchestratorPanel";
import { MainTabs } from "../files/MainTabs";
import { visibleAdditions } from "../domain/additions";
import { mergeTicketKey } from "../domain/readiness";
import { frameOrderAtom, hiddenLanesAtom } from "../state/boardUi";
import { useThreadFamily } from "../state/family";
import { PrProvider } from "../state/prStatus";
import { focusedCardAtom, useBoardForYou } from "../state/forYou";
import { addDocs } from "../state/attachmentUploads";
import { countImplementationAgents } from "../state/boardModel";
import { useBoardView } from "../state/boardView";
import { keptWorktreesAtom } from "../state/mergeCleanup";
import { setHiddenAdditions } from "../state/reviews";
import type { ValidBoard } from "../store/boardFiles";
import { ForYouLane } from "./ForYouLane";
import { Lanes } from "./Lanes";
import { additionLaneId, forYouHeight, LANE_IDS, layoutBoard } from "./layout";
import { OrchestratorCard } from "./OrchestratorCard";
import { TicketPanel } from "./TicketPanel";
import { Viewport } from "./Viewport";

const NO_ORDER = {};
const NO_IDS: ReadonlyArray<string> = [];

/** A board's orchestrator card and lanes on the canvas, the ticket tab and the orchestrator's chat, which draw in the side panel. Open files are tabs over the canvas. */
export function BoardScreen({
  project,
  listed,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
}) {
  const registry = useContext(RegistryContext);
  const [dropError, setDropError] = useState<string | null>(null);
  const [hideError, setHideError] = useState<string | null>(null);
  const { board } = listed;
  const { model, issue, stats, decisions, additions } = useBoardView(project, listed);
  const hiddenAdditions = board.hiddenAdditions ?? NO_IDS;
  const visible = useMemo(
    () => visibleAdditions(additions, hiddenAdditions),
    [additions, hiddenAdditions],
  );
  // Only ids still in the file are written, so the list cannot grow past the file.
  const saveHidden = (ids: ReadonlyArray<string>) =>
    void setHiddenAdditions(
      registry,
      project,
      listed,
      ids.filter((id) => additions.some((item) => item.id === id)),
    ).then(setHideError);
  const order = useAtomValue(frameOrderAtom)[board.id] ?? NO_ORDER;
  const forYou = useBoardForYou(project, listed);
  const artifacts = useBoardArtifacts(project, listed, model);
  const hiddenIds = useAtomValue(hiddenLanesAtom(board.id));
  const hidden = useMemo(() => {
    const folded = hiddenIds.split(",");
    const lanes = [
      ...LANE_IDS,
      ...visible.flatMap((item) => (item.place === "canvas" ? [additionLaneId(item.id)] : [])),
    ];
    return new Set<string>(lanes.filter((id) => folded.includes(id)));
  }, [hiddenIds, visible]);
  const layout = useMemo(
    () => layoutBoard(model, order, forYouHeight(forYou.views), hidden, visible),
    [model, order, forYou.views, hidden, visible],
  );
  const family = useThreadFamily(project.environmentId, board.orchestratorThreadId);
  const builders = useMemo(() => countImplementationAgents(model), [model]);
  const tickets = useMemo(() => Object.values(model.lanes).flat(), [model]);
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
      orchestratorThreadId: board.orchestratorThreadId ?? "",
      family,
      tickets,
      mergeOrderNotes,
      keptWorktrees,
      decisions,
      additions: visible,
    };
  }, [
    project,
    board.orchestratorThreadId,
    family,
    tickets,
    forYou.views,
    keptWorktrees,
    decisions,
    visible,
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
        <div className="flex h-full min-h-0">
          <MainTabs
            files={artifacts.files}
            ticketPage={<TicketPanel environmentId={project.environmentId} model={model} page />}
          >
            <Viewport
              content={layout.content}
              onDropFiles={(files) =>
                void addDocs(registry, project, listed, files).then(setDropError)
              }
            >
              <OrchestratorCard
                project={project}
                listed={listed}
                stats={{ ...stats, forYouOpen: forYou.open }}
                builders={builders}
                offPath={model.lanes.off_path.map((view) => view.ticket)}
                hidden={hidden}
                additions={additions}
                onHideAdditions={saveHidden}
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
                onRemoveAddition={(id) => saveHidden([...hiddenAdditions, id])}
              />
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
          {chatSlot !== null &&
            createPortal(<OrchestratorPanel project={project} listed={listed} />, chatSlot)}
          {ticketSlot !== null &&
            createPortal(
              <TicketPanel environmentId={project.environmentId} model={model} />,
              ticketSlot,
            )}
        </div>
      </PrProvider>
    </ArtifactsProvider>
  );
}
