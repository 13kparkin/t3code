import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { OrchestrationV2ThreadShell, ServerProvider } from "@t3tools/contracts";
import { Atom, type AtomRegistry } from "effect/reactivity";

import type { RoleOverride } from "../domain/board";
import { baseInstanceId } from "../orchestrator/orchestratorInstance";
import { defaultPick, type PickableInstance, pickableInstances } from "../providers/providers";
import { runOnePerKey } from "../store/mergeCleanup";
import { applyRoleTargetRequests, setRoleTarget } from "../store/roleTargets";
import { boardEngine, projectBoardsAtom } from "./boards";
import { environmentProjects, environmentSnapshotAtom } from "./projects";
import { engineProvidersAtom } from "./server";

type RoleProject = Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">;

/**
 * The Claude instance a board's agents run on: the one its orchestrator thread runs on, or before
 * it has one, the instance a new orchestrator would start on.
 */
export function boardInstance(
  providers: ReadonlyArray<ServerProvider>,
  threads: ReadonlyArray<OrchestrationV2ThreadShell> | undefined,
  orchestratorThreadId: string | null,
): PickableInstance | null {
  const instances = pickableInstances(providers);
  const thread = threads?.find((shell) => shell.id === orchestratorThreadId);
  const id =
    thread === undefined
      ? defaultPick(instances).value.instanceId
      : baseInstanceId(thread.modelSelection.instanceId);
  return instances.find((instance) => instance.instanceId === id) ?? null;
}

/** Every board that is not archived, in each project that is not archived, for the Roles page's picker. */
export const activeBoardsAtom = Atom.make((get) =>
  get(environmentProjects.projectsAtom)
    .filter((project) => project.archivedAt == null)
    .flatMap((project) => {
      const boards = get(projectBoardsAtom(project.id));
      if (boards.status !== "ready") return [];
      return boards.boards.flatMap((listed) =>
        listed.ok && !listed.board.archived ? [{ project, listed }] : [],
      );
    }),
).pipe(Atom.withLabel("active-boards"));

/** Saves a role's target from Settings, then lists the project's boards again so the page shows it. */
export async function saveRoleTarget(
  registry: AtomRegistry.AtomRegistry,
  project: RoleProject,
  folder: string,
  role: string,
  target: RoleOverride | null,
  instance: PickableInstance | null,
): Promise<string | null> {
  const { files } = boardEngine(registry, project.environmentId);
  const problem = await setRoleTarget(files, project.workspaceRoot, folder, role, target, instance);
  registry.refresh(projectBoardsAtom(project.id));
  return problem;
}

/** Applies the board's open `role_target` items, after the run already going for it ends. */
export function runRoleTargetRequests(
  registry: AtomRegistry.AtomRegistry,
  project: RoleProject,
  storeKey: string,
  folder: string,
): void {
  runOnePerKey(`role-targets:${storeKey}`, async () => {
    const boards = registry.get(projectBoardsAtom(project.id));
    const listed =
      boards.status === "ready"
        ? boards.boards.find((entry) => entry.ok && entry.folder === folder)
        : undefined;
    const threadId = listed?.ok === true ? listed.board.orchestratorThreadId : null;
    const applied = await applyRoleTargetRequests(
      boardEngine(registry, project.environmentId).files,
      project.workspaceRoot,
      folder,
      boardInstance(
        registry.get(engineProvidersAtom),
        registry.get(environmentSnapshotAtom(project.environmentId))?.threads,
        threadId,
      ),
    );
    if (applied) registry.refresh(projectBoardsAtom(project.id));
  });
}
