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
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { type ProjectWorktree, worktreesByProject } from "./projectWorktrees";

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

const NO_WORKTREES: ReadonlyMap<string, ReadonlyArray<ProjectWorktree>> = new Map();

/** The worktrees threads use, per project, which the settings screen offers to delete. */
export const projectWorktreesAtom = Atom.make((get) => {
  const environmentId = get(engineEnvironmentIdAtom);
  const threads =
    environmentId === null ? undefined : get(environmentSnapshotAtom(environmentId))?.threads;
  return threads === undefined ? NO_WORKTREES : worktreesByProject(threads);
}).pipe(Atom.withLabel("project-worktrees"));

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
