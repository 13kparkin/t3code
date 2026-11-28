import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { ModelPicker } from "../chat/ModelPicker";
import type { PickerValue } from "../domain/picker";
import { engineProvidersAtom } from "../state/server";
import { engineEnvironmentIdAtom } from "../state/projects";
import { pickableInstances, type PickableInstance } from "./providers";
import { SignIn } from "./SignIn";

const STATE_TEXT = {
  "signed-in": "Signed in.",
  "signed-out": "Signed out.",
  unknown: "Sign-in unknown.",
} as const;

const stateText = (instance: PickableInstance) =>
  instance.unavailable ??
  (instance.signIn === "signed-in" && instance.account !== null
    ? `Signed in as ${instance.account}.`
    : STATE_TEXT[instance.signIn]);

/** A new orchestrator's provider, model and effort, preselected and named in full so nothing starts on a hidden default. */
export function OrchestratorPick({
  value,
  onChange,
  reason,
}: {
  value: PickerValue;
  onChange: (next: PickerValue) => void;
  /** Why the preselected pick is not the user's default. */
  reason: string | null;
}) {
  const instances = pickableInstances(useAtomValue(engineProvidersAtom));
  const environmentId = useAtomValue(engineEnvironmentIdAtom);
  const [open, setOpen] = useState(false);
  const selected = instances.find((instance) => instance.instanceId === value.instanceId);

  if (instances.length === 0) {
    return <p className="text-muted">The engine reports no provider that is on.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-md border border-line p-1">
        <ModelPicker
          dropDown
          instances={instances}
          value={value}
          onChange={onChange}
          switchBlocked={null}
          open={open}
          onOpenChange={setOpen}
        />
      </div>
      {selected !== undefined && (
        <p
          className={`text-[11px] ${selected.signIn === "signed-out" || selected.unavailable !== null ? "text-red-400" : "text-muted"}`}
        >
          Runs on {selected.name}. {stateText(selected)}
        </p>
      )}
      {selected?.signIn === "signed-out" && environmentId !== null && (
        <SignIn environmentId={environmentId} instance={selected} />
      )}
      {reason !== null && (
        <p data-testid="provider-reason" className="text-[11px] text-muted">
          {reason}
        </p>
      )}
    </div>
  );
}
