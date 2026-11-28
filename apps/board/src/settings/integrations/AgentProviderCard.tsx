import type { EnvironmentId, ServerProvider, ServerSettings } from "@t3tools/contracts";

import { toPickable } from "../../providers/providers";
import { SignIn } from "../../providers/SignIn";
import { ProviderGlyph } from "../../usage/ProviderGlyph";
import { Switch } from "../controls/Switch";
import type { SettingsInput } from "../settingsModel";
import { agentStatus, instanceMutation, usageLine } from "./agentProviders";
import { IntegrationCard } from "./IntegrationCard";
import { IntegrationDetails } from "./IntegrationDetails";
import { RuntimeOptions } from "./RuntimeOptions";

/** One provider the engine runs: its state, account, models and usage, and the switch that turns it on or off. */
export function AgentProviderCard({
  environmentId,
  provider,
  settings,
  now,
  onSave,
}: {
  environmentId: EnvironmentId;
  provider: ServerProvider;
  settings: ServerSettings;
  now: number;
  onSave: (input: SettingsInput) => void;
}) {
  const instance = toPickable(provider);
  const status = agentStatus(provider);
  const facts = [
    provider.version === null ? null : `Version ${provider.version}.`,
    instance.account === null ? null : `Signed in as ${instance.account}.`,
    `${instance.models.length} ${instance.models.length === 1 ? "model" : "models"}.`,
    provider.enabled && provider.installed ? `Usage: ${usageLine(provider, now)}` : null,
  ].filter((fact) => fact !== null);
  const why = provider.unavailableReason ?? provider.message ?? null;

  return (
    <IntegrationCard
      id={provider.instanceId}
      icon={<ProviderGlyph driver={provider.driver} />}
      name={instance.name}
      description={facts.join(" ")}
      status={status}
      actions={
        <Switch
          label={`${instance.name} on`}
          checked={provider.enabled}
          onChange={(enabled) =>
            onSave({
              patch: {},
              providerInstanceMutation: instanceMutation(settings, provider, { enabled }),
            })
          }
        />
      }
    >
      {provider.enabled && (
        <IntegrationDetails>
          {why !== null && status.tone !== "connected" && (
            <p className="text-xs text-muted">{why}</p>
          )}
          {instance.signIn === "signed-out" && (
            <SignIn environmentId={environmentId} instance={instance} />
          )}
          <RuntimeOptions provider={provider} settings={settings} onSave={onSave} />
          {instance.models.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-muted">Models</summary>
              <ul className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-fg">
                {instance.models.map((model) => (
                  <li key={model.slug} className="truncate">
                    {model.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </IntegrationDetails>
      )}
    </IntegrationCard>
  );
}
