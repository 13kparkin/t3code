import { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  canStart,
  defaultPick,
  NO_PICK,
  pickableInstances,
  orchestratorPreset,
  pickOf,
  resolvePick,
  searchModels,
  selectionOf,
  selectionWarning,
  textInstances,
} from "./providers";

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

interface Fixture {
  readonly instanceId: string;
  readonly driver: string;
  readonly status?: "authenticated" | "unauthenticated" | "unknown";
  readonly email?: string;
  readonly installed?: boolean;
  readonly enabled?: boolean;
  readonly unavailableReason?: string;
  readonly canAuthenticate?: boolean;
  readonly message?: string;
  readonly displayName?: string;
  readonly models?: ReadonlyArray<ModelFixture>;
}

interface ModelFixture {
  readonly slug: string;
  readonly isDefault?: boolean;
  readonly isLegacy?: boolean;
  readonly efforts?: ReadonlyArray<string>;
  readonly defaultEffort?: string;
}

const provider = (fixture: Fixture) =>
  decodeProvider({
    instanceId: fixture.instanceId,
    driver: fixture.driver,
    displayName: fixture.displayName,
    enabled: fixture.enabled ?? true,
    installed: fixture.installed ?? true,
    ...(fixture.unavailableReason === undefined
      ? {}
      : { availability: "unavailable", unavailableReason: fixture.unavailableReason }),
    version: null,
    status: "ready",
    auth: { status: fixture.status ?? "authenticated", email: fixture.email },
    setup: { canAuthenticate: fixture.canAuthenticate ?? false, canInstall: false },
    message: fixture.message,
    checkedAt: "2026-11-20T06:00:00.000Z",
    models: (fixture.models ?? []).map(({ efforts, defaultEffort, ...model }) => ({
      name: model.slug,
      isCustom: false,
      capabilities:
        efforts === undefined
          ? null
          : {
              optionDescriptors: [
                {
                  id: "effort",
                  label: "Effort",
                  type: "select",
                  options: efforts.map((id) => ({
                    id,
                    label: id,
                    ...(id === defaultEffort ? { isDefault: true } : {}),
                  })),
                },
              ],
            },
      ...model,
    })),
  });

describe("the provider picker's instances", () => {
  it("Given Cursor, an unavailable Grok, a turned-off Codex and two Claude Code instances, when they are listed, then every enabled one is named with why it cannot start", () => {
    const listed = pickableInstances([
      provider({ instanceId: "cursor", driver: "cursor" }),
      provider({ instanceId: "grok", driver: "grok", unavailableReason: "Grok needs an update" }),
      provider({ instanceId: "codex", driver: "codex", enabled: false }),
      provider({ instanceId: "claudeZ", driver: "claudeAgent", displayName: "Claude Z" }),
      provider({ instanceId: "claudeAgent", driver: "claudeAgent", displayName: "Claude" }),
    ]);
    expect(
      listed.map((instance) => [instance.instanceId, instance.name, instance.unavailable]),
    ).toEqual([
      ["claudeAgent", "Claude Code", null],
      ["claudeZ", "Claude Z", null],
      ["cursor", "Cursor", null],
      ["grok", "Grok", "Grok needs an update"],
    ]);
  });

  it("Given models with a default and a legacy one, when they are listed, then every model is offered with the legacy one last and the default named", () => {
    const [listed] = pickableInstances([
      provider({
        instanceId: "claudeAgent",
        driver: "claudeAgent",
        models: [
          { slug: "claude-old", isLegacy: true },
          { slug: "claude-sonnet-5-5" },
          { slug: "claude-opus-5-5", isDefault: true },
        ],
      }),
    ]);
    expect(listed?.models.map((model) => [model.slug, model.legacy])).toEqual([
      ["claude-sonnet-5-5", false],
      ["claude-opus-5-5", false],
      ["claude-old", true],
    ]);
    expect(listed?.defaultModel).toBe("claude-opus-5-5");
  });

  it("Given a signed-out Claude instance and a signed-in one, when they are listed, then each shows its sign-in state and account", () => {
    const listed = pickableInstances([
      provider({ instanceId: "claudeAgent", driver: "claudeAgent", email: "me@example.com" }),
      provider({
        instanceId: "claudeManaged",
        driver: "claudeAgent",
        status: "unauthenticated",
        canAuthenticate: true,
        displayName: "Claude managed",
      }),
    ]);
    expect(
      listed.map((instance) => [instance.signIn, instance.account, instance.canSignIn]),
    ).toEqual([
      ["signed-in", "me@example.com", false],
      ["signed-out", null, true],
    ]);
    expect(listed.map(canStart)).toEqual([true, false]);
  });

  it("Given a signed-out Claude instance, when it is listed, then the engine's sign-in instructions come with it", () => {
    const [listed] = pickableInstances([
      provider({
        instanceId: "claude_alt",
        driver: "claudeAgent",
        status: "unauthenticated",
        message: "Run `claude auth login` on this machine.",
      }),
    ]);
    expect(listed?.message).toBe("Run `claude auth login` on this machine.");
  });

  it("Given an instance that is not installed, when it is listed, then it cannot start an orchestrator", () => {
    const [listed] = pickableInstances([
      provider({ instanceId: "claudeAgent", driver: "claudeAgent", installed: false }),
    ]);
    expect(listed?.unavailable).toBe("Not installed on the machine that runs T3");
    expect(listed === undefined || canStart(listed)).toBe(false);
  });
});

describe("the orchestrator's pick", () => {
  const claude = (
    status: "authenticated" | "unauthenticated",
    models: ReadonlyArray<ModelFixture> = CLAUDE_MODELS,
  ) => provider({ instanceId: "claudeAgent", driver: "claudeAgent", status, models });
  const CLAUDE_MODELS = [
    {
      slug: "claude-opus-5-5",
      isDefault: true,
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
    { slug: "claude-sonnet-5-5", efforts: ["low", "medium", "high"], defaultEffort: "high" },
  ];

  it("Given a signed-in Claude Code that offers Opus 5.5, when nothing is picked, then it starts on Opus 5.5 at medium with no reason", () => {
    const instances = pickableInstances([claude("authenticated")]);
    expect(defaultPick(instances)).toEqual({
      value: { instanceId: "claudeAgent", model: "claude-opus-5-5", effort: "medium" },
      reason: null,
    });
  });

  it("Given a signed-out Claude Code, when nothing is picked, then it cannot start and the reason says it is signed out", () => {
    const instances = pickableInstances([claude("unauthenticated")]);
    expect(instances.map(canStart)).toEqual([false]);
    expect(defaultPick(instances).reason).toBe(
      "Claude Code is signed out. Starting on Claude Code instead.",
    );
  });

  it.each([
    ["signed out", [claude("unauthenticated")], "Claude Code is signed out."],
    ["off", [], "Claude Code is off."],
  ])(
    "Given Claude Code %s beside an uninstalled provider that sorts first and a signed-in Codex, then the reason is about Claude Code and it starts on Codex",
    (_name, claudes, why) => {
      const instances = pickableInstances([
        provider({ instanceId: "antigravity", driver: "antigravity", installed: false }),
        ...claudes,
        provider({ instanceId: "codex", driver: "codex", models: [{ slug: "gpt-6" }] }),
      ]);
      expect(defaultPick(instances)).toEqual({
        value: { instanceId: "codex", model: "gpt-6", effort: "" },
        reason: `${why} Starting on Codex instead.`,
      });
    },
  );

  it("Given a signed-in Claude Code without Opus 5.5, when nothing is picked, then the reason names the missing model", () => {
    const instances = pickableInstances([
      claude("authenticated", [{ slug: "claude-sonnet-5-5", isDefault: true }]),
    ]);
    expect(defaultPick(instances).reason).toBe(
      "Claude Code does not offer claude-opus-5-5. Starting on Claude Code instead.",
    );
  });

  it("Given no instance, when nothing is picked, then there is no pick and no reason", () => {
    expect(defaultPick([])).toEqual({ value: NO_PICK, reason: null });
  });

  it.each([
    [
      "no saved default",
      null,
      { instanceId: "claudeAgent", model: "claude-opus-5-5", effort: "medium" },
      null,
    ],
    [
      "a saved default whose instance is on",
      { instanceId: "claudeAgent", model: "claude-sonnet-5-5", effort: "low" },
      { instanceId: "claudeAgent", model: "claude-sonnet-5-5", effort: "low" },
      null,
    ],
    [
      "a saved default whose instance is off",
      { instanceId: "codex", model: "gpt-5", effort: "" },
      { instanceId: "claudeAgent", model: "claude-opus-5-5", effort: "medium" },
      "Your default, codex, is not on. Starting on Claude Code instead.",
    ],
  ])(
    "Given %s, then a new orchestrator preselects it, saying why when it falls back",
    (_name, saved, value, reason) => {
      const instances = pickableInstances([claude("authenticated")]);
      expect(orchestratorPreset(instances, saved)).toEqual({ value, reason });
    },
  );

  it("Given a pick, when it resolves, then the pick stands over the preset", () => {
    const instances = pickableInstances([claude("authenticated")]);
    const pick = { instanceId: "claudeAgent", model: "claude-sonnet-5-5", effort: "low" };
    expect(resolvePick(instances, pick, orchestratorPreset(instances, null))).toBe(pick);
  });

  it("Given a picked effort, when the selection is made, then the model selection carries it under the model's effort option", () => {
    const instances = pickableInstances([claude("authenticated")]);
    expect(
      selectionOf(instances, {
        instanceId: "claudeAgent",
        model: "claude-opus-5-5",
        effort: "medium",
      }),
    ).toEqual({
      instanceId: "claudeAgent",
      driver: "claudeAgent",
      model: "claude-opus-5-5",
      offered: ["claude-opus-5-5", "claude-sonnet-5-5"],
      options: [{ id: "effort", value: "medium" }],
    });
  });

  it("Given a typed model the instance does not list, when the selection is made, then the typed model is used with the offered list and no options", () => {
    const instances = pickableInstances([claude("authenticated")]);
    expect(
      selectionOf(instances, { instanceId: "claudeAgent", model: " claude-nope ", effort: "high" }),
    ).toEqual({
      instanceId: "claudeAgent",
      driver: "claudeAgent",
      model: "claude-nope",
      offered: ["claude-opus-5-5", "claude-sonnet-5-5"],
      options: [],
    });
  });

  it("Given an empty model, when the selection is made, then the instance's default is used", () => {
    const instances = pickableInstances([claude("authenticated")]);
    expect(
      selectionOf(instances, { instanceId: "claudeAgent", model: "", effort: "" })?.model,
    ).toBe("claude-opus-5-5");
  });

  it("Given a thread's model selection, when it fills the picker, then the effort is the one the selection carries", () => {
    const instances = pickableInstances([claude("authenticated")]);
    expect(
      pickOf(instances, {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: "claude-sonnet-5-5",
        options: [{ id: "effort", value: "low" }],
      }),
    ).toEqual({ instanceId: "claudeAgent", model: "claude-sonnet-5-5", effort: "low" });
  });
});

describe("the text model settings", () => {
  const haiku = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "claude-haiku-5-5" };
  const claude = provider({ instanceId: "claudeAgent", driver: "claudeAgent" });

  it.each([
    ["runs", [claude], haiku, null],
    [
      "is missing",
      [],
      { ...haiku, instanceId: ProviderInstanceId.make("omp") },
      "omp is not an instance this engine runs.",
    ],
    ["is off", [{ ...claude, enabled: false }], haiku, "claudeAgent is turned off."],
    [
      "cannot start",
      [
        {
          ...claude,
          enabled: false,
          installed: false,
          availability: "unavailable",
          unavailableReason: "Driver 'omp' is not registered in this build.",
        },
      ],
      haiku,
      "claudeAgent: Driver 'omp' is not registered in this build.",
    ],
    [
      "is not installed",
      [{ ...claude, installed: false }],
      haiku,
      "claudeAgent is not installed on the machine that runs T3.",
    ],
    [
      "cannot write text",
      [{ ...claude, supportsTextGeneration: false }],
      haiku,
      "claudeAgent cannot write text.",
    ],
    [
      "is signed out",
      [provider({ instanceId: "claudeAgent", driver: "claudeAgent", status: "unauthenticated" })],
      haiku,
      "claudeAgent is signed out.",
    ],
  ] as const)(
    "Given a saved instance that %s, when it is checked, then the warning is %j",
    (_, providers, selection, warning) => {
      expect(selectionWarning(providers, selection)).toBe(warning);
    },
  );

  it("Given Cursor, a disabled provider and one that cannot write text, when text instances are listed, then only Cursor is kept and it keeps its own name", () => {
    const listed = textInstances([
      provider({ instanceId: "cursor", driver: "cursor", displayName: "Cursor" }),
      { ...claude, supportsTextGeneration: false },
      { ...provider({ instanceId: "claudeAgent2", driver: "claudeAgent" }), enabled: false },
    ]);
    expect(listed.map(({ instanceId, name }) => [instanceId, name])).toEqual([
      ["cursor", "Cursor"],
    ]);
  });

  it("Given the default Claude Code instance, when text instances are listed, then it is named Claude Code", () => {
    expect(textInstances([claude]).map((entry) => entry.name)).toEqual(["Claude Code"]);
  });
});

describe("searching the picker's models", () => {
  const instances = pickableInstances([
    provider({
      instanceId: "claudeAgent",
      driver: "claudeAgent",
      models: [{ slug: "claude-opus-5-5" }, { slug: "claude-sonnet-5-5" }],
    }),
    provider({ instanceId: "cursor", driver: "cursor", models: [{ slug: "gpt-5" }] }),
  ]);
  it.each([
    ["part of a model name", "sonn", ["claudeAgent/claude-sonnet-5-5"]],
    ["a provider's name", "cursor", ["cursor/gpt-5"]],
    ["nothing that matches", "zzzz", []],
  ])("Given %s, then it lists the matching models", (_name, query, expected) => {
    expect(
      searchModels(instances, query).map((row) => `${row.instance.instanceId}/${row.model.slug}`),
    ).toEqual(expected);
  });
});
