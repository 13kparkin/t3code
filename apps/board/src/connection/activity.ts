import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { request } from "@t3tools/client-runtime/rpc";
import { type ClientActivityReportInput, type EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as SubscriptionRef from "effect/SubscriptionRef";

const REPORT_INTERVAL = "25 seconds";
const REPORT_TIMEOUT = "15 seconds";
const LEASE_TTL_MS = 45_000;

interface PageState {
  readonly visibilityState: DocumentVisibilityState;
  readonly hasFocus: () => boolean;
}

/** The engine refreshes provider status, usage included, only while some client holds a provider-status lease. */
export function activityReport(
  environmentId: EnvironmentId,
  clientId: string,
  clientKind: ClientActivityReportInput["clientKind"],
  page: PageState,
  nowMs: number,
): ClientActivityReportInput {
  return {
    environmentId,
    clientId,
    clientKind,
    visible: page.visibilityState === "visible",
    focused: page.hasFocus(),
    recentlyInteracted: false,
    scopes: [{ type: "provider-status" }],
    ttlMs: LEASE_TTL_MS,
    observedAt: DateTime.makeUnsafe(nowMs),
  };
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
    const clientId = yield* (yield* SecureRandom.SecureRandom).uuidV4();
    const clientKind = window.board ? "desktop-renderer" : "web";
    const report = Effect.gen(function* () {
      const nowMs = yield* Clock.currentTimeMillis;
      const entries = yield* SubscriptionRef.get(registry.entries);
      yield* Effect.forEach(
        entries.keys(),
        (environmentId) =>
          registry
            .run(
              environmentId,
              request(
                WS_METHODS.serverReportClientActivity,
                activityReport(environmentId, clientId, clientKind, document, nowMs),
              ),
            )
            .pipe(Effect.timeout(REPORT_TIMEOUT), Effect.ignoreCause),
        { concurrency: "unbounded", discard: true },
      );
    });
    yield* report.pipe(Effect.repeat(Schedule.spaced(REPORT_INTERVAL)), Effect.forkScoped);
  }),
);
