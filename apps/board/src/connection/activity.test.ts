import { EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { activityReport } from "./activity";

const environmentId = EnvironmentId.make("engine");

describe("activityReport", () => {
  it("asks for provider status while the board is in front, and reports when it is not", () => {
    const front = { visibilityState: "visible" as const, hasFocus: () => true };
    const hidden = { visibilityState: "hidden" as const, hasFocus: () => false };

    expect(activityReport(environmentId, "client-1", "desktop-renderer", front, 0)).toEqual({
      environmentId,
      clientId: "client-1",
      clientKind: "desktop-renderer",
      visible: true,
      focused: true,
      recentlyInteracted: false,
      scopes: [{ type: "provider-status" }],
      ttlMs: 45_000,
      observedAt: DateTime.makeUnsafe(0),
    });
    expect(activityReport(environmentId, "client-1", "web", hidden, 0)).toMatchObject({
      clientKind: "web",
      visible: false,
      focused: false,
    });
  });
});
