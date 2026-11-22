import {
  AVAILABLE_CONNECTION_STATE,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import {
  createEnvironmentProjectAtoms,
  createProjectEnvironmentAtoms,
} from "@t3tools/client-runtime/state/projects";
import {
  createEnvironmentShellAtoms,
  createEnvironmentSnapshotAtom,
} from "@t3tools/client-runtime/state/shell";
import { isListedThreadLineage } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

export const environmentCatalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);
export const environmentShell = createEnvironmentShellAtoms(connectionAtomRuntime);
export const environmentSnapshotAtom = createEnvironmentSnapshotAtom(environmentShell.stateAtom);

export const environmentProjects = createEnvironmentProjectAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentSnapshotAtom,
});

export const projectEnvironment = createProjectEnvironmentAtoms(connectionAtomRuntime, {
  projectAtom: environmentProjects.projectAtom,
});

/** The one engine the app talks to, which has no id until it answers. */
export const engineEnvironmentIdAtom = Atom.make(
  (get) =>
    get(environmentCatalog.catalogValueAtom).entries.values().next().value?.target.environmentId ??
    null,
).pipe(Atom.withLabel("engine-environment-id"));

export interface ProjectWorktree {
  readonly path: string;
  readonly branch: string | null;
  readonly title: string;
}

const NO_WORKTREES: ReadonlyMap<string, ReadonlyArray<ProjectWorktree>> = new Map();

/** The worktrees that listed threads use, per project, which the settings screen offers to delete. */
export const projectWorktreesAtom = Atom.make(
  (get): ReadonlyMap<string, ReadonlyArray<ProjectWorktree>> => {
    const environmentId = get(engineEnvironmentIdAtom);
    const threads =
      environmentId === null ? undefined : get(environmentSnapshotAtom(environmentId))?.threads;
    if (threads === undefined) return NO_WORKTREES;
    const byProject = new Map<string, Map<string, ProjectWorktree>>();
    for (const thread of threads) {
      if (thread.worktreePath === null || thread.deletedAt !== null) continue;
      if (!isListedThreadLineage(thread.lineage)) continue;
      const worktrees = byProject.get(thread.projectId) ?? new Map<string, ProjectWorktree>();
      worktrees.set(thread.worktreePath, {
        path: thread.worktreePath,
        branch: thread.branch,
        title: thread.title,
      });
      byProject.set(thread.projectId, worktrees);
    }
    return new Map(
      [...byProject].map(([projectId, worktrees]) => [projectId, [...worktrees.values()]]),
    );
  },
).pipe(Atom.withLabel("project-worktrees"));

export interface EngineConnection {
  readonly state: SupervisorConnectionState;
  /** Set when the client refuses the engine, for example one that is too old. */
  readonly unsupportedReason: string | undefined;
}

const NOT_REGISTERED: EngineConnection = {
  state: AVAILABLE_CONNECTION_STATE,
  unsupportedReason: undefined,
};

/** The connection to the one engine the app talks to, which is not registered until it answers. */
export const engineConnectionAtom = Atom.make((get): EngineConnection => {
  const [entry] = get(environmentCatalog.catalogValueAtom).entries.values();
  if (entry === undefined) return NOT_REGISTERED;
  return {
    state: AsyncResult.getOrElse(
      get(environmentCatalog.stateAtom(entry.target.environmentId)),
      () => AVAILABLE_CONNECTION_STATE,
    ),
    unsupportedReason: entry.unsupportedReason,
  };
}).pipe(Atom.withLabel("engine-connection"));
