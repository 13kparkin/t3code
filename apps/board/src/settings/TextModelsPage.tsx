import { useAtomValue } from "@effect/atom-react";
import type { ServerSettings } from "@t3tools/contracts";
import { useMemo, useState } from "react";

import { ModelPicker } from "../chat/ModelPicker";
import { modelSelectionOf, pickOf, textInstances, selectionWarning } from "../providers/providers";
import { engineProvidersAtom } from "../state/server";
import { buttonClass } from "./controls/buttonClass";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import type { SettingsInput } from "./settingsModel";

const TASKS = [
  {
    key: "textGenerationModelSelection",
    title: "Thread titles and other generated text",
    description: "Also names branches and writes commit messages until they get their own model.",
  },
  {
    key: "sourceControlWriterModelSelection",
    title: "Commit messages, pull requests, and branch names",
    description: "Leave it unset to follow the model above.",
  },
] as const;

export function TextModelsPage({
  settings,
  save,
}: {
  settings: ServerSettings;
  save: (input: SettingsInput) => void;
}) {
  const providers = useAtomValue(engineProvidersAtom);
  const instances = useMemo(() => textInstances(providers), [providers]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <SettingsSection
      title="Text generation models"
      clip={false}
      note="Branch names come from the commit and branch model, or from the first when that is unset. Pick an instance that is installed and signed in."
    >
      {TASKS.map((task) => {
        const own = settings[task.key];
        const selection = own ?? settings.textGenerationModelSelection;
        const warning = selectionWarning(providers, selection);
        return (
          <SettingsRow
            key={task.key}
            title={task.title}
            description={task.description}
            control={
              <span className="flex items-center gap-2">
                {task.key === "sourceControlWriterModelSelection" && own !== null && (
                  <button
                    type="button"
                    onClick={() => save({ patch: { [task.key]: null } })}
                    className={buttonClass}
                  >
                    Follow text generation
                  </button>
                )}
                <ModelPicker
                  dropDown
                  instances={instances}
                  value={pickOf(instances, selection)}
                  onChange={(next) => {
                    const picked = modelSelectionOf(instances, next);
                    if (picked !== null) save({ patch: { [task.key]: picked } });
                  }}
                  switchBlocked={null}
                  open={open === task.key}
                  onOpenChange={(next) => setOpen(next ? task.key : null)}
                />
              </span>
            }
          >
            {warning !== null && (
              <p role="alert" className="text-xs text-red-400">
                {warning}
              </p>
            )}
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
