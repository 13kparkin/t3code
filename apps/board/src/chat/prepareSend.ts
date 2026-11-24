import {
  type ChatAttachment,
  type EnvironmentId,
  type ModelSelection,
  ProviderInstanceId,
} from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";

import { modelSelectionOf, type PickableInstance, selectionOf } from "../providers/providers";
import { uploadAttachments } from "../state/attachmentUploads";
import { ensureOrchestratorInstance } from "../state/orchestrator";
import { attachmentInputs } from "./attachments";
import type { PendingSend } from "./timeline";

export async function prepareSend(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  pending: PendingSend,
  instances: ReadonlyArray<PickableInstance>,
  threadInstanceId: string,
): Promise<
  { selection: ModelSelection | null; attachments: ChatAttachment[] } | { error: string }
> {
  let selection: ModelSelection | null = null;
  const picked = selectionOf(instances, pending.shown);
  const base = modelSelectionOf(instances, pending.shown);
  if (picked !== null && base !== null) {
    try {
      const instanceId = await ensureOrchestratorInstance(registry, environmentId, picked);
      if (pending.overridden || instanceId !== threadInstanceId) {
        selection = { ...base, instanceId: ProviderInstanceId.make(instanceId) };
      }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : String(failure) };
    }
  }
  if (pending.files.length === 0) return { selection, attachments: [] };
  const checked = attachmentInputs(pending.files);
  if ("error" in checked) return { error: checked.error };
  try {
    const attachments = await uploadAttachments(
      registry,
      environmentId,
      pending.files,
      checked.inputs,
    );
    return { selection, attachments };
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : String(failure) };
  }
}
