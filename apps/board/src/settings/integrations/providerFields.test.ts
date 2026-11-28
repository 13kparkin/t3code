import { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { providerFields, withField } from "./providerFields";

const settingsSchema = Schema.Struct({
  binaryPath: Schema.optionalKey(Schema.String).annotateKey({
    title: "Binary path",
    providerSettingsForm: { placeholder: "kiro-cli" },
  }),
  internal: Schema.optionalKey(Schema.String).annotateKey({
    providerSettingsForm: { hidden: true },
  }),
  compactIdle: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))).annotateKey({
    providerSettingsForm: { control: "switch" },
  }),
}).annotate({ providerSettingsFormSchema: { order: ["compactIdle"] } });

describe("a driver's settings fields", () => {
  it("Given ordered, hidden and defaulted fields, then they list in order, without the hidden one, with their labels and defaults", () => {
    expect(
      providerFields({ settingsSchema, driverKind: ProviderDriverKind.make("kiro") }, {}).map(
        (field) => [field.key, field.label, field.control, field.placeholder, field.defaultBoolean],
      ),
    ).toEqual([
      ["compactIdle", "Compact Idle", "switch", null, true],
      ["binaryPath", "Binary path", "text", "kiro-cli", null],
    ]);
  });
});

describe("changing one field of an instance's config", () => {
  const config = { binaryPath: "/old", other: 1 };
  it.each([
    ["a new value", "omit", "/new", { binaryPath: "/new", other: 1 }],
    ["an emptied field that omits empty values", "omit", "", { other: 1 }],
    ["an emptied field that keeps empty values", "persist", "", { binaryPath: "", other: 1 }],
    ["a switch", "omit", false, { binaryPath: false, other: 1 }],
  ] as const)("Given %s, then only that key changes", (_name, clearWhenEmpty, value, expected) => {
    expect(withField(config, { key: "binaryPath", clearWhenEmpty }, value)).toEqual(expected);
  });
});
