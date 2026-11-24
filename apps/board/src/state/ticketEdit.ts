import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { AtomRegistry } from "effect/reactivity";

import {
  editOverlay,
  type EditPatch,
  type Overlay,
  type Pulled,
  pullOverlay,
  unlinkOverlay,
} from "../domain/ticketOverlay";
import { changeOverlay } from "../store/ticketOverlay";
import { boardEngine } from "./boards";
import { boardStoreAtom } from "./orchestrator";

type DetailsProject = Pick<EnvironmentProject, "id" | "environmentId" | "workspaceRoot">;

/** Saves a change to `ticket-details.json`, then reads the board's files again so the card shows it at once. Resolves to the failure text, or null once saved. */
async function save(
  registry: AtomRegistry.AtomRegistry,
  project: DetailsProject,
  folder: string,
  change: (overlay: Overlay) => Overlay,
): Promise<string | null> {
  try {
    await changeOverlay(
      boardEngine(registry, project.environmentId).files,
      project.workspaceRoot,
      folder,
      change,
    );
    return null;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  } finally {
    registry.refresh(boardStoreAtom(`${project.id}/${folder}`));
  }
}

export const editTicket = (
  registry: AtomRegistry.AtomRegistry,
  project: DetailsProject,
  folder: string,
  ticketKey: string,
  patch: EditPatch,
) => save(registry, project, folder, (overlay) => editOverlay(overlay, ticketKey, patch));

export const unlinkTicket = (
  registry: AtomRegistry.AtomRegistry,
  project: DetailsProject,
  folder: string,
  ticketKey: string,
) => save(registry, project, folder, (overlay) => unlinkOverlay(overlay, ticketKey));

export const savePulled = (
  registry: AtomRegistry.AtomRegistry,
  project: DetailsProject,
  folder: string,
  ticketKey: string,
  pulled: Pulled,
) => save(registry, project, folder, (overlay) => pullOverlay(overlay, ticketKey, pulled));
