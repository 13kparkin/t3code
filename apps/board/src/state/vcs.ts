import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { createVcsEnvironmentAtoms } from "@t3tools/client-runtime/state/vcs";
import { EnvironmentId, ThreadId, type WorktreeSetupSnapshot } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";

import { engineBridge } from "../connection/bridge";
import { connectionAtomRuntime } from "../connection/runtime";
import { failureText } from "../settings/failureText";
import { type GitWorktree, parseWorktreeList, worktreesOnDisk } from "./gitWorktrees";
import { setupLine } from "./worktreeSetup";

export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);

/**
 * T3's worktree delete. Resolves to the failure text, or null once it is gone. Without `force`,
 * git refuses a worktree with changes or untracked files.
 */
export async function deleteWorktree(
  registry: AtomRegistry.AtomRegistry,
  target: { readonly environmentId: EnvironmentId; readonly cwd: string },
  path: string,
  { force = true } = {},
): Promise<string | null> {
  const result = await runAtomCommand(
    registry,
    vcsEnvironment.removeWorktree,
    { environmentId: target.environmentId, input: { cwd: target.cwd, path, force } },
    { reportFailure: false },
  );
  registry.refresh(gitWorktreesAtom(target.cwd));
  return result._tag === "Failure" ? failureText(result) : null;
}

/** A project's `git worktree list`, read through the desktop shell. Undefined while it loads, null without a shell. */
const gitWorktreesAtom = Atom.family((projectRoot: string) =>
  Atom.make((get): ReadonlyArray<GitWorktree> | null | undefined => {
    void engineBridge
      .listGitWorktrees(projectRoot)
      .then((stdout) => get.setSelf(stdout === null ? null : parseWorktreeList(stdout)));
    return undefined;
  }).pipe(Atom.withLabel(`git-worktrees:${projectRoot}`)),
);

const decodeOnDiskKey = Schema.decodeUnknownSync(Schema.Tuple([EnvironmentId, Schema.String]));

/**
 * The worktree folders on disk under a project, never its main checkout, each with git's branch or
 * null when detached, or null while loading. Without the desktop shell, as in `dev:web`, a worktree
 * counts when a local branch points at it.
 * Keyed by `[environmentId, workspaceRoot]` as JSON.
 */
export const worktreesOnDiskAtom = Atom.family((key: string) => {
  const [environmentId, cwd] = decodeOnDiskKey(JSON.parse(key));
  return Atom.make((get): ReadonlyMap<string, string | null> | null => {
    const listed = get(gitWorktreesAtom(cwd));
    if (listed === undefined) return null;
    if (listed !== null) return worktreesOnDisk(listed);
    // `refresh` skips the engine's snapshot, which a worktree made by a thread does not update.
    const refs = AsyncResult.getOrElse(
      get(
        vcsEnvironment.listRefs({
          environmentId,
          input: { cwd, refKind: "local", limit: 200, refresh: true },
        }),
      ),
      () => null,
    );
    if (refs === null) return null;
    return new Map(
      refs.refs.flatMap((ref) =>
        ref.worktreePath === null || ref.worktreePath === cwd ? [] : [[ref.worktreePath, ref.name]],
      ),
    );
  }).pipe(Atom.withLabel(`worktrees-on-disk:${key}`));
});

const decodeSetupKey = Schema.decodeUnknownSync(Schema.Tuple([EnvironmentId, ThreadId]));

/**
 * T3's setup snapshot for a thread, kept for the session after its stream closes or its card
 * remounts, because T3 sends nothing once the agent's run ends. A later snapshot replaces it.
 * Keyed by `[environmentId, threadId]` as JSON.
 */
export const lastSetupSnapshotAtom = Atom.family((key: string) => {
  const [environmentId, threadId] = decodeSetupKey(JSON.parse(key));
  return Atom.make((get): WorktreeSetupSnapshot | null => {
    const live = AsyncResult.getOrElse(
      get(
        vcsEnvironment.worktreeSetup({
          environmentId,
          input: { threadId },
        }),
      ),
      () => null,
    );
    if (live !== null) return live;
    const previous = Option.getOrNull(get.self<WorktreeSetupSnapshot | null>());
    return setupLine(previous)?.kind === "failed" ? previous : null;
  }).pipe(Atom.keepAlive, Atom.withLabel(`worktree-setup-last:${key}`));
});
