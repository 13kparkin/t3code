import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Eye, Layers, ListChecks, Paperclip, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { createPortal } from "react-dom";

import { chooseTicket } from "../browser/panel";
import { useArtifacts } from "../artifacts/ArtifactsContext";
import { isRunLive } from "../chat/timeline";
import { type Addition, lineText, visibleAdditions } from "../domain/additions";
import { pickTemplate, SYSTEM_TEMPLATE } from "../domain/reviewTemplate";
import { STAGE_LABEL, TICKET_STAGES, type Ticket } from "../domain/ticket";
import { AddFromIssue } from "../issues/AddFromIssue";
import type { OrchestratorStats } from "../orchestrator/brief";
import { baseInstanceId } from "../orchestrator/orchestratorInstance";
import { laneKey, toggleFolded } from "../state/boardUi";
import { reviewTemplatesAtom, setBoardReviewTemplate, usageNoticeAtom } from "../state/reviews";
import { usePrContext } from "../state/prStatus";
import { useEnvironmentThread } from "../state/threads";
import type { ValidBoard } from "../store/boardFiles";
import { PopMenu } from "../ui/PopMenu";
import { BuilderCap } from "./BuilderCap";
import { additionLaneId, LANE_IDS, LANE_LABEL, ORCHESTRATOR_BOX } from "./layout";

/** Mounts the board's usage watch, which messages the orchestrator when a usage window passes a level. */
function UsageWatch({ instanceId, threadId }: { instanceId: string; threadId: string }) {
  useAtomValue(usageNoticeAtom(`${baseInstanceId(instanceId)}/${threadId}`));
  return null;
}

/** A board's orchestrator on the canvas: its tickets by stage, what waits on the user, and its builders against the cap. */
export function OrchestratorCard({
  project,
  listed,
  stats,
  builders,
  offPath,
  hidden,
  additions,
  hiddenAdditions,
  onHideAdditions,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  stats: OrchestratorStats;
  builders: number;
  /** Tickets with no lane on the canvas. */
  offPath: ReadonlyArray<Ticket>;
  /** Stage lanes and `canvas` addition lanes the user folded away. */
  hidden: ReadonlySet<string>;
  /** Every `additions.json` item, hidden ones too, so the menu can show them again. */
  additions: ReadonlyArray<Addition>;
  hiddenAdditions: ReadonlyArray<string>;
  onHideAdditions: (ids: ReadonlyArray<string>) => void;
}) {
  const { board } = listed;
  // The panel holds the same thread open, so this adds no second subscription.
  const projection = Option.getOrNull(
    useEnvironmentThread(
      project.environmentId,
      board.orchestratorThreadId === null ? null : ThreadId.make(board.orchestratorThreadId),
    ).data,
  );
  const { groups, open } = useArtifacts();
  const [adding, setAdding] = useState(false);
  const registry = useContext(RegistryContext);
  const custom = useAtomValue(reviewTemplatesAtom);
  const [pickError, setPickError] = useState<string | null>(null);
  const picked = pickTemplate(board.reviewTemplate, custom);
  const docs = board.docs ?? [];
  const tickets = usePrContext().tickets.map((view) => view.ticket);
  const shown = visibleAdditions(additions, hiddenAdditions);
  const lines = shown.filter((item) => item.place === "orchestrator");
  const laneLabels = new Map<string, string>([
    ...LANE_IDS.map((id) => [id, LANE_LABEL[id]] as const),
    ...shown.flatMap((item) =>
      item.place === "canvas" ? [[additionLaneId(item.id), item.title] as const] : [],
    ),
  ]);
  const status =
    board.orchestratorThreadId === null
      ? "Not started"
      : projection !== null && isRunLive(projection)
        ? "Working"
        : "Idle";

  return (
    <section
      aria-label="Orchestrator card"
      data-testid="orchestrator-card"
      className="absolute rounded-xl border border-line bg-panel p-3 shadow-panel"
      style={{ left: ORCHESTRATOR_BOX.x, top: ORCHESTRATOR_BOX.y, width: ORCHESTRATOR_BOX.width }}
    >
      <header className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold">{board.name}</h3>
        {board.orchestratorThreadId !== null && (
          <button
            type="button"
            data-testid="add-from-tracker"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-5 text-muted hover:bg-hover hover:text-fg"
          >
            <Plus className="size-3" aria-hidden />
            Add from tracker
          </button>
        )}
        <div onPointerDown={(event) => event.stopPropagation()}>
          <PopMenu
            label="Review template"
            align="start"
            triggerClass="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-5 text-muted hover:bg-hover hover:text-fg"
            trigger={
              <>
                <ListChecks className="size-3" aria-hidden />
                Review
              </>
            }
            items={[SYSTEM_TEMPLATE, ...custom].map((template) => ({
              label: template.name,
              hint: template.name === picked.name ? "Current" : undefined,
              onSelect: () => {
                setPickError(null);
                void setBoardReviewTemplate(
                  registry,
                  project,
                  listed,
                  template === SYSTEM_TEMPLATE ? undefined : template.name,
                ).then(setPickError);
              },
            }))}
          />
        </div>
        <div onPointerDown={(event) => event.stopPropagation()}>
          <PopMenu
            label="Lanes"
            align="start"
            triggerClass="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-5 text-muted hover:bg-hover hover:text-fg"
            trigger={
              <>
                <Eye className="size-3" aria-hidden />
                {hidden.size > 0 ? `${hidden.size} hidden` : "Lanes"}
              </>
            }
            items={[...laneLabels].map(([id, label]) => ({
              label,
              hint: hidden.has(id) ? "Hidden" : "Shown",
              onSelect: () => void toggleFolded(registry, laneKey(board.id, id)),
            }))}
          />
        </div>
        {additions.length > 0 && (
          <div onPointerDown={(event) => event.stopPropagation()}>
            <PopMenu
              label="Additions"
              align="start"
              triggerClass="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-5 text-muted hover:bg-hover hover:text-fg"
              trigger={
                <>
                  <Layers className="size-3" aria-hidden />
                  {hiddenAdditions.length > 0 ? `${hiddenAdditions.length} hidden` : "Added"}
                </>
              }
              items={[
                ...additions.map((item) => {
                  const isHidden = hiddenAdditions.includes(item.id);
                  return {
                    label: `${item.title} · ${item.place}`,
                    hint: isHidden ? "Hidden" : "Shown",
                    onSelect: () =>
                      onHideAdditions(
                        isHidden
                          ? hiddenAdditions.filter((id) => id !== item.id)
                          : [...hiddenAdditions, item.id],
                      ),
                  };
                }),
                {
                  label: "Reset to default",
                  onSelect: () => onHideAdditions(additions.map((item) => item.id)),
                },
                { label: "Show all", onSelect: () => onHideAdditions([]) },
              ]}
            />
          </div>
        )}
        <span data-testid="card-status" className="text-[11px] text-muted">
          {status}
        </span>
      </header>
      <p className="mt-0.5 text-[11px] text-faint">Orchestrator</p>
      <dl className="mt-2.5 grid grid-cols-5 gap-x-2 gap-y-2">
        {TICKET_STAGES.map((stage) => (
          <div key={stage} className="min-w-0">
            <dt className="text-[10px] leading-tight text-faint">{STAGE_LABEL[stage]}</dt>
            <dd className={stats.stages[stage] === 0 ? "text-faint" : "text-fg"}>
              {stage === "off_path" && offPath.length > 0 ? (
                <span onPointerDown={(event) => event.stopPropagation()}>
                  <PopMenu
                    label="Off path tickets"
                    align="start"
                    triggerClass="text-fg underline decoration-dotted hover:text-accent"
                    trigger={stats.stages[stage]}
                    items={offPath.map((ticket) => ({
                      label: `${ticket.key} ${ticket.title}`,
                      onSelect: () =>
                        chooseTicket(registry, { threadId: null, ticketKey: ticket.key }),
                    }))}
                  />
                </span>
              ) : (
                stats.stages[stage]
              )}
            </dd>
          </div>
        ))}
      </dl>
      {docs.length > 0 && (
        <div data-testid="board-docs" className="mt-2">
          <p className="text-[10px] text-faint">
            Docs{" "}
            <span data-testid="docs-count" className="text-fg">
              {docs.length}
            </span>
          </p>
          <ul data-scroll className="max-h-12 overflow-y-auto">
            {docs.map((doc) => (
              <li key={doc.name} className="truncate text-[11px] text-muted">
                {doc.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
        <span className="text-muted">
          For you{" "}
          <span data-testid="foryou-open" className={stats.forYouOpen > 0 ? "text-fg" : ""}>
            {stats.forYouOpen}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-muted">
          Artifacts{" "}
          {groups.board.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-[18px] text-muted opacity-60">
              <Paperclip className="size-3" aria-hidden />0
            </span>
          ) : (
            <span onPointerDown={(event) => event.stopPropagation()}>
              <PopMenu
                label={`${groups.board.length} board artifacts`}
                triggerClass="inline-flex items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-[18px] text-muted hover:bg-hover hover:text-fg"
                trigger={
                  <>
                    <Paperclip className="size-3" aria-hidden />
                    {groups.board.length}
                  </>
                }
                items={groups.board.map((artifact) => ({
                  label: artifact.name,
                  onSelect: () => open(artifact),
                }))}
              />
            </span>
          )}
        </span>
        <span className="text-muted">
          Builders <BuilderCap project={project} listed={listed} builders={builders} />
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] text-muted" data-testid="latest-decision">
        {stats.latestDecision === null
          ? "No decisions yet"
          : `${stats.latestDecision.time}  ${stats.latestDecision.decision}`}
      </p>
      {lines.length > 0 && (
        <dl>
          {lines.map((item) => (
            <div
              key={item.id}
              data-testid="addition-line"
              data-addition={item.id}
              className="flex gap-2 text-[11px] leading-[18px]"
            >
              <dt className="shrink-0 text-faint">{item.title}</dt>
              <dd className="min-w-0 truncate text-fg">{lineText(item, tickets)}</dd>
            </div>
          ))}
        </dl>
      )}
      {pickError !== null && (
        <p role="alert" className="mt-1 text-[11px] break-words text-red-400">
          {pickError}
        </p>
      )}
      {stats.problems.map((problem) => (
        <p key={problem} role="alert" className="mt-1 text-[11px] break-words text-red-400">
          {problem}
        </p>
      ))}
      {board.orchestratorThreadId !== null && projection !== null && (
        <UsageWatch
          instanceId={projection.thread.modelSelection.instanceId}
          threadId={board.orchestratorThreadId}
        />
      )}
      {adding &&
        board.orchestratorThreadId !== null &&
        createPortal(
          <AddFromIssue
            project={project}
            orchestratorThreadId={board.orchestratorThreadId}
            onDone={() => setAdding(false)}
          />,
          document.body,
        )}
    </section>
  );
}
