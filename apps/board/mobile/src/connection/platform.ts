import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  ConnectionBlockedError,
  type ConnectionTransientError,
  Connectivity,
  CredentialStore,
  makePullRequestRoutingPermissions,
  ProfileStore,
  PullRequestRoutingPermissions,
  Wakeups,
} from "@t3tools/client-runtime/connection";
import {
  ClientCapabilities,
  type ConnectionCatalogDocument,
  Persistence,
  PlatformConnectionSource,
  putRemoteDpopTokenInCatalog,
  registerConnectionInCatalog,
  removeCatalogValue,
  removeConnectionFromCatalog,
  replaceCatalogValue,
  setConnectionEnabledInCatalog,
  setRoutesInCatalog,
} from "@t3tools/client-runtime/platform";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

import { makeCatalogStore } from "./storage";

const networkStatus = (state: Network.NetworkState) =>
  state.isConnected === true ? "online" : state.isConnected === false ? "offline" : "unknown";

const layerConnectivity = Connectivity.layer({
  status: Effect.tryPromise({
    try: () => Network.getNetworkStateAsync(),
    catch: () => undefined,
  }).pipe(Effect.match({ onFailure: () => "unknown" as const, onSuccess: networkStatus })),
  changes: Stream.callback((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        Network.addNetworkStateListener((state) => Queue.offerUnsafe(queue, networkStatus(state))),
      ),
      (subscription) => Effect.sync(() => subscription.remove()),
    ).pipe(Effect.asVoid),
  ),
});

const layerWakeups = Wakeups.layer({
  changes: Stream.callback<Wakeups.ConnectionWakeup>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        AppState.addEventListener("change", (state) => {
          if (state === "active") Queue.offerUnsafe(queue, "application-active");
        }),
      ),
      (subscription) => Effect.sync(() => subscription.remove()),
    ).pipe(Effect.asVoid),
  ),
});

const persistenceError =
  (operation: Persistence.ConnectionPersistenceError["operation"]) =>
  (error: ConnectionTransientError) =>
    new Persistence.ConnectionPersistenceError({ operation, message: error.message });

const layerPersistence = Layer.effectContext(
  Effect.gen(function* () {
    const { read, update } = yield* makeCatalogStore(SecureStore);
    const save = (
      operation: Persistence.ConnectionPersistenceError["operation"],
      transform: (document: ConnectionCatalogDocument) => ConnectionCatalogDocument,
    ) => update(transform).pipe(Effect.mapError(persistenceError(operation)));

    const targetStore = Persistence.ConnectionTargetStore.of({
      list: read.pipe(
        Effect.map((document) => document.targets),
        Effect.mapError(persistenceError("list-targets")),
      ),
      listDisabled: read.pipe(
        Effect.map((document) => document.disabledEnvironmentIds),
        Effect.mapError(persistenceError("list-disabled-targets")),
      ),
    });
    const registrationStore = Persistence.ConnectionRegistrationStore.of({
      register: (registration, routes) =>
        save("register-connection", (document) =>
          registerConnectionInCatalog(document, registration, routes),
        ),
      setRoutes: (environmentId, routes) =>
        save("set-connection-routes", (document) =>
          setRoutesInCatalog(document, environmentId, routes),
        ),
      remove: (environmentId) =>
        save("remove-connection", (document) =>
          removeConnectionFromCatalog(document, environmentId),
        ),
      setEnabled: (environmentId, enabled) =>
        save("set-connection-enabled", (document) =>
          setConnectionEnabledInCatalog(document, environmentId, enabled),
        ),
    });
    const profileStore = ProfileStore.make({
      get: (connectionId) =>
        Effect.map(read, (document) =>
          Option.fromUndefinedOr(
            document.profiles.find((candidate) => candidate.connectionId === connectionId),
          ),
        ),
      put: (profile) =>
        update((document) => ({
          ...document,
          profiles: replaceCatalogValue(document.profiles, (value) => value.connectionId, profile),
        })),
      remove: (connectionId) =>
        update((document) => ({
          ...document,
          profiles: removeCatalogValue(
            document.profiles,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const credentialStore = CredentialStore.make({
      get: (connectionId) =>
        Effect.map(read, (document) =>
          Option.fromUndefinedOr(
            document.credentials.find((entry) => entry.connectionId === connectionId)?.credential,
          ),
        ),
      put: (connectionId, credential) =>
        update((document) => ({
          ...document,
          credentials: replaceCatalogValue(document.credentials, (value) => value.connectionId, {
            connectionId,
            credential,
          }),
        })),
      remove: (connectionId) =>
        update((document) => ({
          ...document,
          credentials: removeCatalogValue(
            document.credentials,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const remoteTokenStore = TokenStore.make({
      get: (environmentId) =>
        Effect.map(read, (document) =>
          Option.fromUndefinedOr(
            document.remoteDpopTokens.find((token) => token.environmentId === environmentId),
          ),
        ),
      put: (token) => update((document) => putRemoteDpopTokenInCatalog(document, token)),
      remove: (environmentId) =>
        update((document) => ({
          ...document,
          remoteDpopTokens: removeCatalogValue(
            document.remoteDpopTokens,
            (value) => value.environmentId,
            environmentId,
          ),
        })),
    });
    const routingPermissions = yield* makePullRequestRoutingPermissions({
      read: Effect.map(read, (document) => document.githubRoutingPermissions ?? []),
      write: (githubRoutingPermissions) =>
        update((document) => ({ ...document, githubRoutingPermissions })),
    });
    const cacheStore = Persistence.EnvironmentCacheStore.of({
      loadShell: () => Effect.succeedNone,
      saveShell: () => Effect.void,
      loadThread: () => Effect.succeedNone,
      saveThread: () => Effect.void,
      removeThread: () => Effect.void,
      loadServerConfig: () => Effect.succeedNone,
      saveServerConfig: () => Effect.void,
      loadVcsRefs: () => Effect.succeedNone,
      saveVcsRefs: () => Effect.void,
      removeVcsRefs: () => Effect.void,
      clearVcsRefs: () => Effect.void,
      clear: () => Effect.void,
    });
    return Context.make(Persistence.ConnectionTargetStore, targetStore).pipe(
      Context.add(PullRequestRoutingPermissions, routingPermissions),
      Context.add(Persistence.ConnectionRegistrationStore, registrationStore),
      Context.add(ProfileStore.ConnectionProfileStore, profileStore),
      Context.add(CredentialStore.ConnectionCredentialStore, credentialStore),
      Context.add(TokenStore.RemoteDpopAccessTokenStore, remoteTokenStore),
      Context.add(Persistence.EnvironmentCacheStore, cacheStore),
    );
  }),
);

const unavailable = (feature: string) =>
  new ConnectionBlockedError({
    reason: "unsupported",
    detail: `${feature} is not available in Agent Board.`,
  });

const layerCapabilities = Layer.succeedContext(
  // The paired engine's bearer session lives in the credential store, so there is no primary.
  Context.make(
    ClientCapabilities.PrimaryEnvironmentAuth,
    ClientCapabilities.PrimaryEnvironmentAuth.of({ bearerToken: Effect.succeedNone }),
  ).pipe(
    Context.add(
      ClientCapabilities.CloudSession,
      ClientCapabilities.CloudSession.of({
        identity: Effect.succeedNone,
        clerkToken: Effect.fail(unavailable("T3 Connect")),
      }),
    ),
    Context.add(
      ClientCapabilities.RelayDeviceIdentity,
      ClientCapabilities.RelayDeviceIdentity.of({ deviceId: Effect.succeedNone }),
    ),
    Context.add(
      ClientCapabilities.ClientPresentation,
      ClientCapabilities.ClientPresentation.of({
        metadata: {
          label: "Agent Board phone",
          surface: "mobile",
          deviceType: "mobile",
          os: "Android",
        },
      }),
    ),
    Context.add(
      ClientCapabilities.SshEnvironmentGateway,
      ClientCapabilities.SshEnvironmentGateway.of({
        provision: () => Effect.fail(unavailable("SSH")),
        prepare: () => Effect.fail(unavailable("SSH")),
        disconnect: () => Effect.void,
      }),
    ),
  ),
);

const layerPlatformConnectionSource = Layer.succeed(
  PlatformConnectionSource.PlatformConnectionSource,
  PlatformConnectionSource.PlatformConnectionSource.of({ registrations: Stream.empty }),
);

export const layer = Layer.mergeAll(
  layerPersistence,
  layerConnectivity,
  layerWakeups,
  layerCapabilities,
  layerPlatformConnectionSource,
);
