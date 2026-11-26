import { ConnectionTransientError } from "@t3tools/client-runtime/connection";
import {
  ConnectionCatalogDocument,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
} from "@t3tools/client-runtime/platform";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

export const CATALOG_KEY = "agentboard.connection-catalog.v1";

/** The `expo-secure-store` calls the catalog makes. */
export interface SecureStorage {
  readonly getItemAsync: (key: string) => Promise<string | null>;
  readonly setItemAsync: (key: string, value: string) => Promise<void>;
}

const CatalogJson = Schema.fromJsonString(ConnectionCatalogDocument);
const decodeCatalog = Schema.decodeEffect(CatalogJson);
const encodeCatalog = Schema.encodeEffect(CatalogJson);

const storageError = (operation: "read" | "save") => (cause: unknown) =>
  new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: `Could not ${operation} the saved connection: ${String(cause)}`,
  });

/**
 * The connection catalog, credentials included, as one document in the Android keystore-backed
 * secure store.
 */
export const makeCatalogStore = Effect.fn("phone.connection.makeCatalogStore")(function* (
  storage: SecureStorage,
) {
  const cached = yield* Ref.make(Option.none<ConnectionCatalogDocument>());
  const lock = yield* Semaphore.make(1);

  const load = Effect.gen(function* () {
    const current = yield* Ref.get(cached);
    if (Option.isSome(current)) return current.value;
    const raw = yield* Effect.tryPromise({
      try: () => storage.getItemAsync(CATALOG_KEY),
      catch: storageError("read"),
    });
    // The decode error quotes the document, which holds the credential, so it is not logged.
    const document =
      raw === null
        ? EMPTY_CONNECTION_CATALOG_DOCUMENT
        : yield* decodeCatalog(raw).pipe(
            Effect.catch(() =>
              Effect.logWarning("Discarding a corrupt connection catalog.").pipe(
                Effect.as(EMPTY_CONNECTION_CATALOG_DOCUMENT),
              ),
            ),
          );
    yield* Ref.set(cached, Option.some(document));
    return document;
  });

  const update = Effect.fn("phone.connection.updateCatalog")(function* (
    transform: (document: ConnectionCatalogDocument) => ConnectionCatalogDocument,
  ) {
    yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const next = transform(yield* load);
        const raw = yield* encodeCatalog(next).pipe(Effect.mapError(storageError("save")));
        yield* Effect.tryPromise({
          try: () => storage.setItemAsync(CATALOG_KEY, raw),
          catch: storageError("save"),
        });
        yield* Ref.set(cached, Option.some(next));
      }),
    );
  });

  return { read: lock.withPermits(1)(load), update };
});
