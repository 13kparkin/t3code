import { Connection, ConnectionOnboarding } from "@t3tools/client-runtime/connection";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";
import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import { createRuntimeCommand } from "@t3tools/client-runtime/state/runtime";
import { ShellSnapshotLoader } from "@t3tools/client-runtime/state/shell";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
} from "@t3tools/client-runtime/state/threads";
import { RelayMobileClientId } from "@t3tools/contracts/relay";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Atom } from "effect/reactivity";
import * as Socket from "effect/socket/Socket";
import * as ExpoCrypto from "expo-crypto";

import * as ConnectionPlatform from "./platform";

const noRelayKey = "T3 Connect is not available in Agent Board.";

// T3 Connect is out of scope, but the connection layer is built with its relay client. Nothing
// registers a relay environment, and a failed proof makes pairing fall back to a bearer session.
const layerRelay = ManagedRelay.layer({
  relayUrl: "http://relay.invalid",
  clientId: RelayMobileClientId,
}).pipe(
  Layer.provideMerge(
    Layer.succeed(
      ManagedRelay.ManagedRelayDpopSigner,
      ManagedRelay.ManagedRelayDpopSigner.of({
        thumbprint: Effect.fail(
          new ManagedRelay.ManagedRelayDpopKeyLoadError({
            keyStore: "expo-secure-store",
            cause: noRelayKey,
          }),
        ),
        createProof: ({ method, url }) =>
          Effect.fail(
            new ManagedRelay.ManagedRelayDpopProofCreationError({ method, url, cause: noRelayKey }),
          ),
      }),
    ),
  ),
);

const layerRuntime = layerRelay.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      layerRemoteHttpClient((input, init) => globalThis.fetch(input, init)),
      Socket.layerWebSocketConstructorGlobal,
    ),
  ),
);

const layerSnapshotLoader = Layer.mergeAll(
  BoundedThreadSnapshotLoader.layer,
  ShellSnapshotLoader.layer,
  ThreadHistoryController.layer,
);

// Hermes has no WebCrypto, so ids come from expo-crypto.
const layerSecureRandom = Layer.succeed(
  SecureRandom.SecureRandom,
  SecureRandom.make(ExpoCrypto.getRandomBytes),
);

const layerConnection = layerSnapshotLoader.pipe(
  Layer.provideMerge(Connection.layer),
  Layer.provideMerge(Layer.mergeAll(layerRuntime, ConnectionPlatform.layer)),
  Layer.provideMerge(layerSecureRandom),
);

type ConnectionLayerSource =
  | typeof Connection.layer
  | typeof layerSnapshotLoader
  | typeof layerRuntime
  | typeof ConnectionPlatform.layer
  | typeof layerSecureRandom;

export const connectionAtomRuntime: Atom.AtomRuntime<
  Layer.Success<ConnectionLayerSource>,
  Layer.Error<ConnectionLayerSource>
> = Atom.runtime(layerConnection);

export const environmentCatalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);

export const connectPairingUrl = createRuntimeCommand(connectionAtomRuntime, {
  label: "phone:connection:connect-pairing-url",
  // A QR scan reports the same code many times, and the engine accepts it only once.
  concurrency: { mode: "singleFlight", key: (pairingUrl: string) => pairingUrl },
  execute: (pairingUrl: string) =>
    ConnectionOnboarding.ConnectionOnboarding.pipe(
      Effect.flatMap((onboarding) => onboarding.registerPairing({ pairingUrl })),
    ),
});
