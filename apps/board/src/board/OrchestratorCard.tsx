import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Archive, Layers, ListChecks, Paperclip, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { createPortal } from "react-dom";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import { type Addition, lineText } from "../domain/additions";
import { pickTemplate, SYSTEM_TEMPLATE } from "../domain/reviewTemplate";
import { STAGE_LABEL, TICKET_STAGES } from "../domain/ticket";
import { AddFromIssue } from "../issues/AddFromIssue";
import type { OrchestratorStats } from "../orchestrator/brief";
import { baseInstanceId } from "../orchestrator/orchestratorInstance";
import { laneKey, toggleFolded } from "../state/boardUi";
import { reviewTemplatesAtom, setBoardReviewTemplate, usageNoticeAtom } from "../state/reviews";
import { usePrContext } from "../state/prStatus";
import { useEnvironmentThread } from "../state/threads";
import type { ValidBoard } from "../store/boardFiles";
import { PopMenu } from "../ui/PopMenu";
import { Tooltip } from "../ui/Tooltip";
import { BuilderCap } from "./BuilderCap";
import { useOrchestratorStatus } from "./useOrchestratorStatus";
import type { ArchivedCard } from "../state/cardStates";
import { additionLaneId, DONE_TAG, ORCHESTRATOR_BOX, stageTagCount, stageTagId } from "./layout";

/** Mounts the board's usage watch, which messages the orchestrator when a usage window passes a level. */
function UsageWatch({ instanceId, threadId }: { instanceId: string; threadId: string }) {
  useAtomValue(usageNoticeAtom(`${baseInstanceId(instanceId)}/${threadId}`));
  return null;
}

const ACTION =
  "inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 text-[11px] leading-5 text-muted hover:bg-hover hover:text-fg";

export function OrchestratorCard({
  project,
  listed,
  stats,
  builders,
  hidden,
  additions,
  onChangeHidden,
  doneCount,
  todoAgents,
  archived,
  onUnarchive,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  stats: OrchestratorStats;
  builders: number;
  /** The filter ids whose cards or lane the canvas hides. */
  hidden: ReadonlySet<string>;
  /** Every `additions.json` item, hidden ones too, so the menu can show them again. */
  additions: ReadonlyArray<Addition>;
  onChangeHidden: (change: (ids: ReadonlyArray<string>) => ReadonlyArray<string>) => void;
  /** Cards in the Done lane, shown or not. */
  doneCount: number;
  /** Agent rows in the To do lane, which its tag counts. */
  todoAgents: number;
  archived: ReadonlyArray<ArchivedCard>;
  onUnarchive: (key: string) => void;
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
  const hiddenAdditions = board.hiddenAdditions ?? [];
  const context = usePrContext();
  const tickets = context.tickets.map((view) => view.ticket);
  const shown = context.additions;
  const lines = shown.filter((item) => item.place === "orchestrator");
  const filters: ReadonlyArray<{ id: string; label: string; count: number | null }> = [
    ...TICKET_STAGES.map((stage) => ({
      id: stageTagId(stage),
      label: STAGE_LABEL[stage],
      count: stageTagCount(stage, stats.stages, todoAgents),
    })),
    { id: DONE_TAG, label: "Done", count: doneCount },
    { id: "for_you", label: "For you", count: stats.forYouOpen },
    ...shown.flatMap((item) =>
      item.place === "canvas"
        ? [{ id: additionLaneId(item.id), label: item.title, count: null }]
        : [],
    ),
  ];
  const status = useOrchestratorStatus(board.orchestratorThreadId);

  return (
    <section
      aria-label="Orchestrator card"
      data-testid="orchestrator-card"
      className="shrink-0 rounded-xl border border-line bg-panel p-3 shadow-panel"
      style={{ width: ORCHESTRATOR_BOX.width }}
    >
      <header className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold">{board.name}</h3>
        <span data-testid="card-status" className="shrink-0 text-[11px] text-muted">
          {status}
        </span>
      </header>
      <div
        className="mt-1 flex items-center gap-1.5"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="min-w-0 flex-1 truncate text-[11px] text-faint">Orchestrator</p>
        {board.orchestratorThreadId !== null && (
          <Tooltip text="Add from tracker" side="bottom">
            <button
              type="button"
              data-testid="add-from-tracker"
              aria-label="Add from tracker"
              onClick={() => setAdding(true)}
              className={ACTION}
            >
              <Plus className="size-3" aria-hidden />
              Add
            </button>
          </Tooltip>
        )}
        <PopMenu
          label="Review template"
          triggerClass={ACTION}
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
        {additions.length > 0 && (
          <PopMenu
            label="Additions"
            triggerClass={ACTION}
            trigger={
              <>
                <Layers className="size-3" aria-hidden />
                {hiddenAdditions.length > 0 && `${hiddenAdditions.length} hidden`}
              </>
            }
            items={[
              ...additions.map((item) => {
                const isHidden = hiddenAdditions.includes(item.id);
                return {
                  label: `${item.title} · ${item.place}`,
                  hint: isHidden ? "Hidden" : "Shown",
                  onSelect: () =>
                    onChangeHidden((ids) =>
                      isHidden ? ids.filter((id) => id !== item.id) : [...ids, item.id],
                    ),
                };
              }),
              {
                label: "Reset to default",
                onSelect: () => onChangeHidden(() => additions.map((item) => item.id)),
              },
              { label: "Show all", onSelect: () => onChangeHidden(() => []) },
            ]}
          />
        )}
        {archived.length > 0 && (
          <PopMenu
            label="Archived cards"
            triggerClass={ACTION}
            trigger={
              <>
                <Archive className="size-3" aria-hidden />
                {archived.length}
              </>
            }
            items={archived.map((card) => ({
              label: card.label,
              hint: "Unarchive",
              onSelect: () => onUnarchive(card.key),
            }))}
          />
        )}
      </div>
      <div
        role="group"
        aria-label="Show on the canvas"
        data-testid="tag-filter"
        className="mt-2.5 flex flex-wrap gap-1"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {filters.map(({ id, label, count }) => {
          const on = !hidden.has(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-filter={id}
              onClick={() => void toggleFolded(registry, laneKey(board.id, id))}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 text-[11px] leading-5 hover:bg-hover ${on ? "border-line text-fg" : "border-transparent text-faint"}`}
            >
              <span className="truncate">{label}</span>
              {count !== null && <span className="tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
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
      <div className="mt-3 flex items-start justify-between gap-3 border-t border-line pt-2">
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
      <p
        data-testid="latest-decision"
        className="mt-2 line-clamp-3 text-[11px] break-words text-muted"
      >
        {stats.latestDecision === null ? (
          "No decisions yet"
        ) : (
          <>
            <span className="text-faint">{stats.latestDecision.time}</span>{" "}
            {stats.latestDecision.decision}
          </>
        )}
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
      {stats.problems.map((problem, at) => (
        // oxlint-disable-next-line react/no-array-index-key -- two problem lines can read the same once ids are shortened
        <p key={at} role="alert" className="truncate text-[11px] leading-[18px] text-red-400">
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
