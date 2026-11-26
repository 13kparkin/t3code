import type { SupervisorConnectionState } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";

export type EngineStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "unpaired" }
  | {
      readonly kind: "connecting" | "reconnecting" | "connected";
      readonly environmentId: EnvironmentId;
      readonly label: string;
    }
  | {
      readonly kind: "refused";
      readonly environmentId: EnvironmentId;
      readonly label: string;
      readonly detail: string;
    };

export function pairedEngineStatus(
  environmentId: EnvironmentId,
  label: string,
  state: SupervisorConnectionState,
): EngineStatus {
  switch (state.phase) {
    case "connected":
      return { kind: "connected", environmentId, label };
    case "blocked":
      return {
        kind: "refused",
        environmentId,
        label,
        detail: state.lastFailure?.detail ?? "The engine refused this phone.",
      };
    case "offline":
    case "backoff":
      return { kind: "reconnecting", environmentId, label };
    case "available":
    case "connecting":
      return { kind: "connecting", environmentId, label };
  }
}
