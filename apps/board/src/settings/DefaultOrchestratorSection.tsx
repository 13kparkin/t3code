import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useContext, useState } from "react";

import { ModelPicker } from "../chat/ModelPicker";
import {
  DEFAULT_ORCHESTRATOR,
  orchestratorPreset,
  pickableInstances,
} from "../providers/providers";
import { defaultOrchestratorAtom, saveDefaultOrchestrator } from "../state/defaultOrchestrator";
import { engineProvidersAtom } from "../state/server";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

/** The provider and model a new board or Start orchestrator preselects, kept in this app's own settings. */
export function DefaultOrchestratorSection() {
  const registry = useContext(RegistryContext);
  const instances = pickableInstances(useAtomValue(engineProvidersAtom));
  const saved = useAtomValue(defaultOrchestratorAtom);
  const [open, setOpen] = useState(false);
  const preset = orchestratorPreset(instances, saved);

  return (
    <SettingsSection title="Default orchestrator model" clip={false}>
      <SettingsRow
        title="New orchestrators"
        description={
          preset.reason ??
          `A new board or Start orchestrator preselects this. You can change it there before it starts. Built-in default: Claude Code on ${DEFAULT_ORCHESTRATOR.model}.`
        }
        origin={{
          inherited: saved === null,
          onReset: () => void saveDefaultOrchestrator(registry, null),
        }}
        control={
          <ModelPicker
            dropDown
            instances={instances}
            value={preset.value}
            onChange={(next) => void saveDefaultOrchestrator(registry, next)}
            switchBlocked={null}
            open={open}
            onOpenChange={setOpen}
          />
        }
      />
    </SettingsSection>
  );
}
