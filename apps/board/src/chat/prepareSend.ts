import {
  type ChatAttachment,
  type EnvironmentId,
  type ModelSelection,
  ProviderInstanceId,
  type RuntimeMode,
} from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";

import { orchestratorMode } from "../orchestrator/launch";
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
  | {
      selection: ModelSelection | null;
      standing: string | null;
      runtimeMode: RuntimeMode | null;
      attachments: ChatAttachment[];
    }
  | { error: string }
> {
  let selection: ModelSelection | null = null;
  // Rules a provider without launch arguments needs in the message that moves the thread onto it.
  let standing: string | null = null;
  // A move onto another instance takes that provider's orchestrator mode, so a switch cannot keep full access.
  let runtimeMode: RuntimeMode | null = null;
  const picked = selectionOf(instances, pending.shown);
  const base = modelSelectionOf(instances, pending.shown);
  if (picked !== null && base !== null) {
    try {
      const target = await ensureOrchestratorInstance(registry, environmentId, picked);
      if (pending.overridden || target.instanceId !== threadInstanceId) {
        selection = { ...base, instanceId: ProviderInstanceId.make(target.instanceId) };
      }
      if (target.instanceId !== threadInstanceId) {
        standing = target.standing;
        runtimeMode = orchestratorMode(picked.driver);
      }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : String(failure) };
    }
  }
  if (pending.files.length === 0) return { selection, standing, runtimeMode, attachments: [] };
  const checked = attachmentInputs(pending.files);
  if ("error" in checked) return { error: checked.error };
  try {
    const attachments = await uploadAttachments(
      registry,
      environmentId,
      pending.files,
      checked.inputs,
    );
    return { selection, standing, runtimeMode, attachments };
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : String(failure) };
  }
}
