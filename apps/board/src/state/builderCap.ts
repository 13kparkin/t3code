import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { AtomRegistry } from "effect/reactivity";

import { setBuilderCap, type ValidBoard } from "../store/boardFiles";
import { boardEngine, projectBoardsAtom } from "./boards";

/** Resolves to the failure text, or null once `board.json` is saved. */
export async function setBoardBuilderCap(
  registry: AtomRegistry.AtomRegistry,
  project: Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">,
  listed: ValidBoard,
  builderCap: number,
): Promise<string | null> {
  try {
    await setBuilderCap(
      boardEngine(registry, project.environmentId).files,
      project.workspaceRoot,
      listed.folder,
      builderCap,
    );
    return null;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  } finally {
    registry.refresh(projectBoardsAtom(project.id));
  }
}
