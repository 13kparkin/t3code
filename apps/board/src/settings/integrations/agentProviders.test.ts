import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { agentStatus, enableMutation, usageLine } from "./agentProviders";

// SAFETY: only the fields these helpers read are filled in.
const provider = (overrides: Partial<ServerProvider>): ServerProvider =>
  ({
    instanceId: "kiro",
    driver: "kiro",
    enabled: true,
    installed: true,
    auth: { status: "authenticated" },
    ...overrides,
  }) as ServerProvider;

describe("a provider card's status", () => {
  it.each([
    ["off", { enabled: false, installed: false }, "Off"],
    ["not installed", { installed: false }, "Not installed"],
    ["unavailable", { availability: "unavailable" }, "Unavailable"],
    ["signed out", { auth: { status: "unauthenticated" } }, "Signed out"],
    ["unknown sign-in", { auth: { status: "unknown" } }, "Sign-in unknown"],
    ["ready", {}, "Ready"],
  ] as const)("Given a provider that is %s, then the pill reads %s", (_name, overrides, label) => {
    expect(agentStatus(provider(overrides)).label).toBe(label);
  });
});

describe("turning a provider on or off", () => {
  const settings: Pick<ServerSettings, "providerInstances"> = {
    providerInstances: {
      [ProviderInstanceId.make("codex")]: {
        driver: ProviderDriverKind.make("codex"),
        displayName: "Work",
        enabled: true,
      },
    },
  };

  it("Given a saved instance, when switched off, then only its enabled flag changes", () => {
    expect(
      enableMutation(
        settings,
        provider({
          instanceId: ProviderInstanceId.make("codex"),
          driver: ProviderDriverKind.make("codex"),
        }),
        false,
      ),
    ).toEqual({
      operation: "upsert",
      instanceId: "codex",
      instance: { driver: "codex", displayName: "Work", enabled: false },
    });
  });

  it("Given a default instance with no saved entry, when switched off, then it is saved from its driver", () => {
    expect(enableMutation(settings, provider({}), false)).toMatchObject({
      instance: {
        driver: "kiro",
        enabled: false,
      },
    });
  });
});

describe("a provider card's usage line", () => {
  it("Given a provider with no usage source, then the line says so by name", () => {
    expect(usageLine(provider({ displayName: "Kiro" }), 0)).toBe("Kiro has no usage source.");
  });
});
