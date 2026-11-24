import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";

import type { RoleTarget } from "../domain/board";
import { baseInstanceId } from "../orchestrator/orchestratorInstance";
import { defaultPick, type PickableInstance, pickableInstances } from "../providers/providers";
import { runOnePerKey } from "../store/mergeCleanup";
import { applyRoleTargetRequests, setRoleTarget } from "../store/roleTargets";
import { boardEngine, projectBoardsAtom } from "./boards";
import { environmentSnapshotAtom } from "./projects";
import { engineProvidersAtom } from "./server";

type RoleProject = Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">;

/**
 * The Claude instance a board's agents run on: the one its orchestrator thread runs on, or before
 * it has one, the instance a new orchestrator would start on.
 */
export function boardInstance(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  orchestratorThreadId: string | null,
): PickableInstance | null {
  const instances = pickableInstances(registry.get(engineProvidersAtom));
  const thread =
    orchestratorThreadId === null
      ? undefined
      : registry
          .get(environmentSnapshotAtom(environmentId))
          ?.threads.find((shell) => shell.id === orchestratorThreadId);
  const id =
    thread === undefined
      ? defaultPick(instances).value.instanceId
      : baseInstanceId(thread.modelSelection.instanceId);
  return instances.find((instance) => instance.instanceId === id) ?? null;
}

/** Saves a role's target from Settings, then lists the project's boards again so the page shows it. */
export async function saveRoleTarget(
  registry: AtomRegistry.AtomRegistry,
  project: RoleProject,
  folder: string,
  role: string,
  target: RoleTarget | null,
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
      boardInstance(registry, project.environmentId, threadId),
    );
    if (applied) registry.refresh(projectBoardsAtom(project.id));
  });
}
