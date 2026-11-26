import { RegistryContext } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { DeviceConfigureInput, EnvironmentId, ServerSettings } from "@t3tools/contracts";
import { useContext, useState } from "react";

import { deviceEnvironment } from "../../state/device";
import { Switch } from "../controls/Switch";
import { failureText } from "../failureText";
import { SettingsRow } from "../SettingsRow";
import { deviceConfigureInput } from "../settingsModel";
import { IntegrationGroup } from "./IntegrationGroup";

export function DevicesSection({
  environmentId,
  settings,
}: {
  environmentId: EnvironmentId;
  settings: ServerSettings;
}) {
  const registry = useContext(RegistryContext);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configure = async (input: DeviceConfigureInput) => {
    setSaving(true);
    setError(null);
    const result = await runAtomCommand(
      registry,
      deviceEnvironment.configure,
      { environmentId, input },
      { reportFailure: false },
    );
    setSaving(false);
    if (result._tag === "Failure") setError(failureText(result));
  };

  return (
    <IntegrationGroup
      title="Devices"
      description="Simulators and emulators on the engine's machine. These settings belong to the engine, so T3 shows the same values."
    >
      <SettingsRow
        title="Device hub"
        description="Lets the engine open simulators and emulators. Turning it off also turns off agent access."
        control={
          <Switch
            label="Device hub"
            checked={settings.enableDeviceSupport}
            disabled={saving}
            onChange={(enabled) => void configure(deviceConfigureInput("hub", enabled))}
          />
        }
      />
      <SettingsRow
        title="Agent device access"
        description="Agents can list, open and drive these devices. Only agents started after a change get it. Running agents keep the tools they started with."
        control={
          <Switch
            label="Agent device access"
            checked={settings.enableAgentDeviceAccess}
            disabled={saving || !settings.enableDeviceSupport}
            onChange={(enabled) => void configure(deviceConfigureInput("agent", enabled))}
          />
        }
      />
      {error !== null && (
        <p role="alert" className="px-3 py-2.5 text-xs break-words text-red-400">
          {error}
        </p>
      )}
    </IntegrationGroup>
  );
}
