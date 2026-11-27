import {
  EnvironmentRegistry,
  EnvironmentSupervisor,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import {
  getEnvironmentSpeechStatus,
  installEnvironmentSpeechModel,
} from "@t3tools/client-runtime/voice-input";
import type { EnvironmentId, EnvironmentSpeechStatus } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { HttpClient } from "effect/http";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

export async function runSpeech<A, E>(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  use: (
    prepared: PreparedConnection,
  ) => Effect.Effect<A, E, HttpClient.HttpClient | EnvironmentRegistry.EnvironmentRegistry>,
): Promise<A> {
  const run = <B, F>(
    effect: Effect.Effect<B, F, HttpClient.HttpClient | EnvironmentRegistry.EnvironmentRegistry>,
  ) =>
    Effect.runPromise(
      AtomRegistry.getResult(registry, connectionAtomRuntime).pipe(
        Effect.flatMap((context) => Effect.provide(effect, context)),
      ),
    );
  // Read from the supervisor itself, since the session's atom is empty until a view mounts it.
  const prepared = Option.getOrNull(
    await run(
      EnvironmentRegistry.EnvironmentRegistry.pipe(
        Effect.flatMap((environments) =>
          environments.run(
            environmentId,
            EnvironmentSupervisor.EnvironmentSupervisor.pipe(
              Effect.flatMap((supervisor) => SubscriptionRef.get(supervisor.prepared)),
            ),
          ),
        ),
      ),
    ),
  );
  if (prepared === null) throw new Error("The engine is not connected.");
  return run(use(prepared));
}

/** The engine's speech status as last read, by a transcription or the Voice page. */
export const speechStatusAtom = Atom.make<EnvironmentSpeechStatus | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("speech-status"),
);

export const modelInstalled = (status: EnvironmentSpeechStatus | null) =>
  status?.supported === true && status.state !== "missing-model";

export async function readSpeechStatus(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
) {
  const status = await runSpeech(registry, environmentId, getEnvironmentSpeechStatus);
  registry.set(speechStatusAtom, status);
  return status;
}

export const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** Reads the status while something shows it. Holds why the read failed, or null. */
export const speechCheckAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get): string | null => {
    void readSpeechStatus(get.registry, environmentId).then(
      () => get.setSelf(null),
      (cause) => get.setSelf(errorText(cause)),
    );
    return null;
  }).pipe(Atom.withLabel(`speech-check:${environmentId}`)),
);

type Install =
  | { readonly status: "idle" | "installing" }
  | { readonly status: "failed"; readonly message: string };

/** Kept outside the Voice page, so leaving it does not lose a download that is still going. */
export const speechInstallAtom = Atom.make<Install>({ status: "idle" }).pipe(
  Atom.keepAlive,
  Atom.withLabel("speech-install"),
);

/** Downloads the model and selects it, the way T3's voice setup does. */
export async function installSpeechModel(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  modelId: string,
) {
  if (registry.get(speechInstallAtom).status === "installing") return;
  registry.set(speechInstallAtom, { status: "installing" });
  try {
    await runSpeech(registry, environmentId, (prepared) =>
      installEnvironmentSpeechModel(prepared, modelId),
    );
    const status = await readSpeechStatus(registry, environmentId);
    registry.set(
      speechInstallAtom,
      modelInstalled(status)
        ? { status: "idle" }
        : { status: "failed", message: "The download stopped before the model was installed." },
    );
  } catch (cause) {
    registry.set(speechInstallAtom, { status: "failed", message: errorText(cause) });
  }
}
