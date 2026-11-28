import { providerClients } from "@t3tools/client-runtime/provider-clients";
import type { ServerProvider, ServerSettings } from "@t3tools/contracts";
import { useState } from "react";

import { Select } from "../controls/Select";
import { Switch } from "../controls/Switch";
import { TextInput } from "../controls/TextInput";
import type { SettingsInput } from "../settingsModel";
import { instanceMutation, savedConfig } from "./agentProviders";
import { isFlag, isText, providerFields, withField } from "./providerFields";
import { subordinateRow } from "./IntegrationCard";

/** The driver's own settings, such as its binary and home paths, saved on the instance as T3's settings save them. */
export function RuntimeOptions({
  provider,
  settings,
  onSave,
}: {
  provider: ServerProvider;
  settings: ServerSettings;
  onSave: (input: SettingsInput) => void;
}) {
  const [rejected, setRejected] = useState<string | null>(null);
  const definition = providerClients.get(provider.driver);
  if (definition === undefined) return null;
  const fields = providerFields(definition);
  if (fields.length === 0) return null;
  const config = savedConfig(settings, provider);
  if (config === null) {
    return <p className="text-xs text-faint">Options are set outside the board.</p>;
  }
  const save = (field: (typeof fields)[number], value: string | boolean) => {
    if (isText(value) && value !== "" && !field.accepts(value)) {
      setRejected(`${field.label} does not take "${value}".`);
      return;
    }
    setRejected(null);
    onSave({
      patch: {},
      providerInstanceMutation: instanceMutation(settings, provider, {
        config: withField(config, field, value),
      }),
    });
  };

  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted">Options</summary>
      <div className="mt-1">
        {fields.map((field) => {
          const value = config[field.key];
          const control = field.secret ? (
            <span className="text-xs text-faint">Kept secret by the engine</span>
          ) : field.control === "switch" ? (
            <Switch
              label={field.label}
              checked={isFlag(value) ? value : (field.defaultBoolean ?? false)}
              onChange={(next) => save(field, next)}
            />
          ) : field.control === "select" ? (
            <Select
              label={field.label}
              value={isText(value) ? value : ""}
              options={[
                { value: "", title: "Default" },
                ...field.options.map((option) => ({ value: option.value, title: option.label })),
              ]}
              onChange={(next) => save(field, next)}
            />
          ) : value === undefined || isText(value) ? (
            <TextInput
              label={field.label}
              value={value ?? ""}
              className="w-56"
              {...(field.placeholder === null ? {} : { placeholder: field.placeholder })}
              onCommit={(next) => save(field, next.trim())}
            />
          ) : (
            <span className="text-xs text-faint">Set outside the board</span>
          );
          return (
            <div key={field.key} className={subordinateRow}>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-fg">{field.label}</p>
                {field.description !== null && (
                  <p className="text-[11px] text-muted">{field.description}</p>
                )}
              </div>
              {control}
            </div>
          );
        })}
        {rejected !== null && (
          <p role="alert" className="text-xs text-red-400">
            {rejected}
          </p>
        )}
      </div>
    </details>
  );
}
