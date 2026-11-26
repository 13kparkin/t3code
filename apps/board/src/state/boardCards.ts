import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { CommandId } from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";

import type { Board, CallEvent, CardState, FreeAgent } from "../domain/board";
import { defaultPick, modelSelectionOf, pickableInstances } from "../providers/providers";
import {
  changeCardState,
  placeFreeAgent,
  type ProjectFiles,
  putCall,
  markCallRecorded,
  removeCall,
  type ValidBoard,
} from "../store/boardFiles";
import { boardEngine, newId, projectBoardsAtom } from "./boards";
import { launchThread } from "./orchestrator";
import { engineProvidersAtom } from "./server";

type BoardProject = Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">;

/** Runs one `board.json` change and refreshes the board. Resolves to the failure text, or null. */
async function changeBoardFile(
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  change: (files: ProjectFiles) => Promise<Board>,
): Promise<string | null> {
  try {
    await change(boardEngine(registry, project.environmentId).files);
    return null;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  } finally {
    registry.refresh(projectBoardsAtom(project.id));
  }
}

export const setCardState = (
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  listed: ValidBoard,
  key: string,
  state: CardState | null,
) =>
  changeBoardFile(registry, project, (files) =>
    changeCardState(files, project.workspaceRoot, listed.folder, key, state),
  );

export const moveFreeAgent = (
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  listed: ValidBoard,
  agent: FreeAgent,
) =>
  changeBoardFile(registry, project, (files) =>
    placeFreeAgent(files, project.workspaceRoot, listed.folder, agent),
  );

export const saveCall = (
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  listed: ValidBoard,
  call: CallEvent,
) =>
  changeBoardFile(registry, project, (files) =>
    putCall(files, project.workspaceRoot, listed.folder, call),
  );

export const deleteCall = (
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  listed: ValidBoard,
  id: string,
  judged?: Pick<CallEvent, "start">,
) =>
  changeBoardFile(registry, project, (files) =>
    removeCall(files, project.workspaceRoot, listed.folder, id, judged),
  );

export const markRecorded = (
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  listed: ValidBoard,
  id: string,
) =>
  changeBoardFile(registry, project, (files) =>
    markCallRecorded(files, project.workspaceRoot, listed.folder, id),
  );

/**
 * Starts an agent the user talks to directly, on the default pick's plain instance so no
 * orchestrator rules reach it, and places its card at the canvas point.
 */
export const startFreeAgent = (
  registry: AtomRegistry.AtomRegistry,
  project: BoardProject,
  listed: ValidBoard,
  at: { readonly x: number; readonly y: number },
) =>
  changeBoardFile(registry, project, async (files) => {
    const instances = pickableInstances(registry.get(engineProvidersAtom));
    const modelSelection = modelSelectionOf(instances, defaultPick(instances).value);
    if (modelSelection === null) throw new Error("No provider can start an agent.");
    const { threadId } = await boardEngine(registry, project.environmentId).run(
      runAtomCommand(
        registry,
        launchThread,
        {
          environmentId: project.environmentId,
          input: {
            commandId: CommandId.make(newId()),
            projectId: project.id,
            title: "Agent",
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            workspaceStrategy: { type: "root" },
          },
        },
        { reportFailure: false },
      ),
    );
    return placeFreeAgent(files, project.workspaceRoot, listed.folder, { threadId, ...at });
  });
