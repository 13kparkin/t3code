import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Archive, ListChecks, type LucideIcon, Paperclip } from "lucide-react";
import { useContext } from "react";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import { lineText } from "../domain/additions";
import type { Doc } from "../domain/board";
import { STAGE_LABEL, TICKET_STAGES } from "../domain/ticket";
import type { OrchestratorStats } from "../orchestrator/brief";
import { baseInstanceId } from "../orchestrator/orchestratorInstance";
import { laneKey, toggleFolded } from "../state/boardUi";
import { usageNoticeAtom } from "../state/reviews";
import { usePrContext } from "../state/prStatus";
import { useEnvironmentThread } from "../state/threads";
import type { ValidBoard } from "../store/boardFiles";
import { BuilderCap } from "./BuilderCap";
import { useOrchestratorStatus } from "./useOrchestratorStatus";
import type { ArchivedCard } from "../state/cardStates";
import {
  BOARD_SECTIONS,
  type BoardSectionId,
  DONE_TAG,
  ORCHESTRATOR_BOX,
  sectionFilterId,
  stageTagCount,
  stageTagId,
} from "./layout";

const SECTION_ICON = {
  artifacts: Paperclip,
  archived: Archive,
  review: ListChecks,
} as const satisfies Record<BoardSectionId, LucideIcon>;

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
  docs,
  doneCount,
  todoAgents,
  archived,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  stats: OrchestratorStats;
  builders: number;
  /** The filter ids whose cards or lane the canvas hides. */
  hidden: ReadonlySet<string>;
  /** The orchestrator's `docs.json` entries. */
  docs: ReadonlyArray<Doc>;
  /** Cards in the Done lane, shown or not. */
  doneCount: number;
  /** Agent rows in the To do lane, which its tag counts. */
  todoAgents: number;
  archived: ReadonlyArray<ArchivedCard>;
}) {
  const { board } = listed;
  // The panel holds the same thread open, so this adds no second subscription.
  const projection = Option.getOrNull(
    useEnvironmentThread(
      project.environmentId,
      board.orchestratorThreadId === null ? null : ThreadId.make(board.orchestratorThreadId),
    ).data,
  );
  const { groups } = useArtifacts();
  const registry = useContext(RegistryContext);
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
  ];
  const sectionCount = {
    artifacts: groups.board.length,
    archived: archived.length,
    review: null,
  } as const satisfies Record<BoardSectionId, number | null>;
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
        {BOARD_SECTIONS.map(({ id, label }) => {
          const Icon = SECTION_ICON[id];
          const count = sectionCount[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={!hidden.has(sectionFilterId(id))}
              aria-label={count === null ? label : `${label}, ${count}`}
              data-section={id}
              onClick={() => void toggleFolded(registry, laneKey(board.id, sectionFilterId(id)))}
              className={`${ACTION} aria-pressed:border-fg/40 aria-pressed:text-fg`}
            >
              <Icon className="size-3" aria-hidden />
              {label}
              {count !== null && <span className="tabular-nums">{count}</span>}
            </button>
          );
        })}
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
              <li key={`${doc.sentAt}:${doc.name}`} className="truncate text-[11px] text-muted">
                {doc.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex items-start justify-end gap-3 border-t border-line pt-2">
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
    </section>
  );
}
