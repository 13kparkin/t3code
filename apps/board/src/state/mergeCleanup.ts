import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Atom, type AtomRegistry } from "effect/reactivity";
import * as Result from "effect/Result";

import { BOARDS_DIR } from "../domain/board";
import { parseTickets, type Ticket } from "../domain/ticket";
import { listBoards } from "../store/boardFiles";
import { type CleanupPorts, cleanupMerged } from "../store/mergeCleanup";
import { boardEngine, familyThread } from "./boards";
import { environmentSnapshotAtom } from "./projects";
import { deleteWorktree, vcsEnvironment } from "./vcs";

type CleanupProject = Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">;

const NONE: ReadonlyMap<string, string> = new Map();

/** Why each merged ticket of a board still has a worktree, by ticket key, from the last cleanup run. */
export const keptWorktreesAtom = Atom.family((storeKey: string) =>
  Atom.make(NONE).pipe(Atom.keepAlive, Atom.withLabel(`kept-worktrees:${storeKey}`)),
);

const running = new Set<string>();

function cleanupPorts(registry: AtomRegistry.AtomRegistry, project: CleanupProject): CleanupPorts {
  const { environmentId, workspaceRoot } = project;
  const { files, threads } = boardEngine(registry, environmentId);
  return {
    files,
    tickets: async () => {
      const all: Ticket[] = [];
      for (const listed of await listBoards(files, workspaceRoot)) {
        if (!listed.ok) return null;
        const text = await files.read(workspaceRoot, `${BOARDS_DIR}/${listed.folder}/tickets.json`);
        if (text === null) continue;
        const parsed = parseTickets(text);
        if (Result.isFailure(parsed)) return null;
        all.push(...parsed.success);
      }
      return all;
    },
    threads: () =>
      registry
        .get(environmentSnapshotAtom(environmentId))
        ?.threads.filter(
          (shell) =>
            shell.projectId === project.id && shell.deletedAt === null && shell.archivedAt === null,
        )
        .map((shell) => ({ ...familyThread(shell), worktreePath: shell.worktreePath })) ?? null,
    status: async (path) => {
      const result = await runAtomCommand(
        registry,
        vcsEnvironment.refreshStatus,
        { environmentId, input: { cwd: path } },
        { reportFailure: false },
      );
      return result._tag === "Success" ? result.value : null;
    },
    remove: (path) =>
      deleteWorktree(registry, { environmentId, cwd: workspaceRoot }, path, { force: false }),
    archive: threads.archive,
  };
}

/** Starts a cleanup of the board's merged tickets unless one is already running for it. */
export function runMergeCleanup(
  registry: AtomRegistry.AtomRegistry,
  project: CleanupProject,
  folder: string,
  ticketsText: string | null,
): void {
  const parsed = ticketsText === null ? null : parseTickets(ticketsText);
  if (parsed === null || Result.isFailure(parsed)) return;
  const merged = parsed.success.filter((ticket) => ticket.stage === "merged");
  const storeKey = `${project.id}/${folder}`;
  if (merged.length === 0 || running.has(storeKey)) return;
  running.add(storeKey);
  void cleanupMerged(
    cleanupPorts(registry, project),
    { workspaceRoot: project.workspaceRoot, folder },
    merged,
  )
    .then(
      (kept) => registry.set(keptWorktreesAtom(storeKey), kept),
      () => undefined,
    )
    .finally(() => running.delete(storeKey));
}
