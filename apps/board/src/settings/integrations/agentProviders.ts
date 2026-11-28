import {
  type ProviderInstanceConfig,
  ProviderInstanceId,
  type ProviderInstanceMutation,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { describeUsage, UNAVAILABLE_DASH } from "../../usage/usage";
import type { IntegrationStatus } from "./IntegrationCard";
import { InstanceConfig } from "./providerFields";

const decodeConfig = Schema.decodeUnknownOption(InstanceConfig);

/** The pill on a provider's card, in the order a user has to fix things. */
export function agentStatus(provider: ServerProvider): IntegrationStatus {
  if (!provider.enabled) return { label: "Off", tone: "neutral" };
  if (!provider.installed) return { label: "Not installed", tone: "attention" };
  if (provider.availability === "unavailable") return { label: "Unavailable", tone: "attention" };
  if (provider.auth.status === "unauthenticated") return { label: "Signed out", tone: "attention" };
  if (provider.auth.status === "unknown") return { label: "Sign-in unknown", tone: "neutral" };
  return { label: "Ready", tone: "connected" };
}

const savedInstance = (
  settings: Pick<ServerSettings, "providerInstances">,
  provider: Pick<ServerProvider, "instanceId" | "driver">,
): ProviderInstanceConfig =>
  (Object.hasOwn(settings.providerInstances, provider.instanceId)
    ? settings.providerInstances[provider.instanceId]
    : undefined) ?? { driver: provider.driver };

/** One instance's saved config, empty for a default instance with no saved entry, or null when it is not a JSON object the board can edit. */
export const savedConfig = (
  settings: Pick<ServerSettings, "providerInstances">,
  provider: Pick<ServerProvider, "instanceId" | "driver">,
): InstanceConfig | null =>
  Option.getOrNull(decodeConfig(savedInstance(settings, provider).config ?? {}));

/** Replaces one instance, starting from its driver when a default instance has no saved entry. */
export function instanceMutation(
  settings: Pick<ServerSettings, "providerInstances">,
  provider: Pick<ServerProvider, "instanceId" | "driver">,
  change: Partial<ProviderInstanceConfig>,
): ProviderInstanceMutation {
  return {
    operation: "upsert",
    instanceId: ProviderInstanceId.make(provider.instanceId),
    instance: { ...savedInstance(settings, provider), ...change },
  };
}

/** The usage line on a card: the windows as the usage bar shows them, or why there are none. */
export function usageLine(provider: ServerProvider, nowMs: number): string {
  const [usage] = describeUsage([provider], nowMs);
  const segments = usage?.segments ?? [];
  const [only] = segments;
  return segments.length === 1 && only !== undefined && only.text === UNAVAILABLE_DASH
    ? only.title
    : segments.map((segment) => `${segment.text} (${segment.title})`).join(" · ");
}
