import {
  ProviderInstanceId,
  type ProviderInstanceMutation,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";

import { describeUsage, UNAVAILABLE_DASH } from "../../usage/usage";
import type { IntegrationStatus } from "./IntegrationCard";

/** The pill on a provider's card, in the order a user has to fix things. */
export function agentStatus(provider: ServerProvider): IntegrationStatus {
  if (!provider.enabled) return { label: "Off", tone: "neutral" };
  if (!provider.installed) return { label: "Not installed", tone: "attention" };
  if (provider.availability === "unavailable") return { label: "Unavailable", tone: "attention" };
  if (provider.auth.status === "unauthenticated") return { label: "Signed out", tone: "attention" };
  if (provider.auth.status === "unknown") return { label: "Sign-in unknown", tone: "neutral" };
  return { label: "Ready", tone: "connected" };
}

/** Turns one instance on or off. A default instance with no saved entry starts from its driver. */
export function enableMutation(
  settings: Pick<ServerSettings, "providerInstances">,
  provider: Pick<ServerProvider, "instanceId" | "driver">,
  enabled: boolean,
): ProviderInstanceMutation {
  const saved = Object.hasOwn(settings.providerInstances, provider.instanceId)
    ? settings.providerInstances[provider.instanceId]
    : undefined;
  return {
    operation: "upsert",
    instanceId: ProviderInstanceId.make(provider.instanceId),
    instance: { ...(saved ?? { driver: provider.driver }), enabled },
  };
}

/** The usage line on a card: the windows as the usage bar shows them, or why there are none. */
export function usageLine(provider: ServerProvider, nowMs: number): string {
  const [usage] = describeUsage([{ ...provider, enabled: true, installed: true }], nowMs);
  const segments = usage?.segments ?? [];
  const [only] = segments;
  return segments.length === 1 && only !== undefined && only.text === UNAVAILABLE_DASH
    ? only.title
    : segments.map((segment) => `${segment.text} (${segment.title})`).join(" · ");
}
