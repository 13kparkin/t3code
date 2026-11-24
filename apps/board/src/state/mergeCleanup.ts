import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Atom, type AtomRegistry } from "effect/reactivity";
import * as Result from "effect/Result";

import { parseTickets } from "../domain/ticket";
import {
  type CleanupPorts,
  cleanupMerged,
  readBoardTickets,
  runOnePerKey,
} from "../store/mergeCleanup";
import { boardEngine, familyThread } from "./boards";
import { environmentSnapshotAtom } from "./projects";
import { deleteWorktree, vcsEnvironment } from "./vcs";

type CleanupProject = Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">;

const NONE: ReadonlyMap<string, string | null> = new Map();

/** Each merged ticket's verdict from the last finished cleanup run: why its worktree is kept, or null when it passed. */
export const keptWorktreesAtom = Atom.family((storeKey: string) =>
  Atom.make(NONE).pipe(Atom.keepAlive, Atom.withLabel(`kept-worktrees:${storeKey}`)),
);

function cleanupPorts(registry: AtomRegistry.AtomRegistry, project: CleanupProject): CleanupPorts {
  const { environmentId, workspaceRoot } = project;
  const { files, threads } = boardEngine(registry, environmentId);
  return {
    files,
    tickets: () => readBoardTickets(files, workspaceRoot),
    worktrees: async () => {
      const result = await runAtomCommand(
        registry,
        vcsEnvironment.readRefs,
        {
          environmentId,
          input: { cwd: workspaceRoot, refKind: "local", limit: 200, refresh: true },
        },
        { reportFailure: false },
      );
      // shortcut: one page of 200 local refs; a worktree past it is kept as unlisted.
      return result._tag === "Success"
        ? result.value.refs.flatMap((ref) => (ref.worktreePath === null ? [] : [ref.worktreePath]))
        : null;
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

/** Starts a cleanup of the board's merged tickets, after the one already running for it ends. */
export function runMergeCleanup(
  registry: AtomRegistry.AtomRegistry,
  project: CleanupProject,
  storeKey: string,
  folder: string,
  ticketsText: string | null,
): void {
  const parsed = ticketsText === null ? null : parseTickets(ticketsText);
  if (parsed === null || Result.isFailure(parsed)) return;
  const merged = parsed.success.filter((ticket) => ticket.stage === "merged");
  runOnePerKey(storeKey, async () => {
    const kept =
      merged.length === 0
        ? NONE
        : await cleanupMerged(
            cleanupPorts(registry, project),
            { workspaceRoot: project.workspaceRoot, folder },
            merged,
          );
    registry.set(
      keptWorktreesAtom(storeKey),
      merged.length === 0
        ? NONE
        : new Map(merged.map((ticket) => [ticket.key, kept.get(ticket.key) ?? null])),
    );
  });
}
