import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  type SupervisorConnectionPhase,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { pairedEngineStatus } from "./status";

const environmentId = EnvironmentId.make("desk");
const revoked = new ConnectionBlockedError({
  reason: "authentication",
  detail: "Pairing revoked.",
});

describe("pairedEngineStatus", () => {
  it.each<[SupervisorConnectionPhase, ConnectionBlockedError | null, object]>([
    ["available", null, { kind: "connecting" }],
    ["connecting", null, { kind: "connecting" }],
    ["connected", null, { kind: "connected" }],
    ["offline", null, { kind: "reconnecting" }],
    ["backoff", null, { kind: "reconnecting" }],
    ["blocked", revoked, { kind: "refused", detail: "Pairing revoked." }],
    ["blocked", null, { kind: "refused", detail: "The engine refused this phone." }],
  ])("maps %s to its header status", (phase, lastFailure, expected) => {
    expect(
      pairedEngineStatus(environmentId, "Desk PC", {
        ...AVAILABLE_CONNECTION_STATE,
        phase,
        lastFailure,
      }),
    ).toEqual({ environmentId, label: "Desk PC", ...expected });
  });
});
