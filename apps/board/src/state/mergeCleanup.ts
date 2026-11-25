import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Atom, type AtomRegistry } from "effect/reactivity";
import * as Result from "effect/Result";

import { engineBridge } from "../connection/bridge";
import { BOARDS_DIR } from "../domain/board";
import { parseTickets } from "../domain/ticket";
import {
  type CleanupPorts,
  cleanupMerged,
  evidenceOnBoardWorktrees,
  readBoardTickets,
  runOnePerKey,
  ticketWorktrees,
} from "../store/mergeCleanup";
import { boardEngine, familyThread } from "./boards";
import { parseWorktreeList } from "./gitWorktrees";
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
    tickets: () => readBoardTickets(files, workspaceRoot),
    worktrees: async () => {
      const listed = await engineBridge.listGitWorktrees(workspaceRoot);
      if (listed !== null) return parseWorktreeList(listed).map((worktree) => worktree.path);
      // Without the desktop shell, as in `dev:web`, only worktrees on a local branch are listed.
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
      if (result._tag !== "Success") return null;
      const status = result.value;
      return status.refName === null
        ? { ...status, headOnOrigin: await engineBridge.headOnOrigin(path) }
        : status;
    },
    remove: (path) =>
      deleteWorktree(registry, { environmentId, cwd: workspaceRoot }, path, { force: false }),
    archive: threads.archive,
  };
}

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
    const ports = cleanupPorts(registry, project);
    const threads = ports.threads() ?? [];
    const worktrees = [
      ...new Set(parsed.success.flatMap((ticket) => ticketWorktrees(ticket, threads))),
    ];
    const report = await engineBridge
      .migrateLegacyEvidence(
        `${project.workspaceRoot}/${BOARDS_DIR}/${folder}/artifacts`,
        worktrees,
      )
      .catch(() => "");
    const kept =
      merged.length === 0
        ? NONE
        : await cleanupMerged(
            ports,
            { workspaceRoot: project.workspaceRoot, folder },
            merged,
            evidenceOnBoardWorktrees(report),
          );
    registry.set(
      keptWorktreesAtom(storeKey),
      merged.length === 0
        ? NONE
        : new Map(merged.map((ticket) => [ticket.key, kept.get(ticket.key) ?? null])),
    );
  });
}
