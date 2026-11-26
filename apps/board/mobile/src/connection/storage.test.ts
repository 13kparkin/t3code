import { describe, expect, it } from "@effect/vitest";
import { BearerConnectionCredential } from "@t3tools/client-runtime/connection";
import { EMPTY_CONNECTION_CATALOG_DOCUMENT } from "@t3tools/client-runtime/platform";
import * as Effect from "effect/Effect";

import { CATALOG_KEY, makeCatalogStore, type SecureStorage } from "./storage";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  const storage: SecureStorage = {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
  };
  return { values, storage };
};

const DOCUMENT = {
  ...EMPTY_CONNECTION_CATALOG_DOCUMENT,
  credentials: [
    {
      connectionId: "bearer:env-1:http://192.168.1.20:3773",
      credential: new BearerConnectionCredential({ token: "session-token" }),
    },
  ],
};

describe("makeCatalogStore", () => {
  it.effect("reads back the document it wrote, from a fresh store", () =>
    Effect.gen(function* () {
      const memory = memoryStorage();
      yield* (yield* makeCatalogStore(memory.storage)).update(() => DOCUMENT);

      expect(yield* (yield* makeCatalogStore(memory.storage)).read).toEqual(DOCUMENT);
      expect(JSON.parse(memory.values.get(CATALOG_KEY) ?? "")).toEqual({
        schemaVersion: 1,
        targets: [],
        profiles: [],
        credentials: [
          {
            connectionId: "bearer:env-1:http://192.168.1.20:3773",
            credential: { _tag: "BearerConnectionCredential", token: "session-token" },
          },
        ],
        remoteDpopTokens: [],
        disabledEnvironmentIds: [],
      });
    }),
  );

  it.effect("reads a corrupt document as empty", () =>
    Effect.gen(function* () {
      const store = yield* makeCatalogStore(memoryStorage({ [CATALOG_KEY]: "{not-json" }).storage);

      expect(yield* store.read).toEqual(EMPTY_CONNECTION_CATALOG_DOCUMENT);
    }),
  );
});
