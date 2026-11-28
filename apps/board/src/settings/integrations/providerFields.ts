// Copied from `deriveProviderSettingsFields` in apps/web/src/components/settings/ProviderSettingsForm.tsx,
// tracked by T-132. Keep the field rules in step with it.
import type { providerClients } from "@t3tools/client-runtime/provider-clients";
import {
  isSecretSetting,
  type ProviderSettingsFormAnnotation,
  type ProviderSettingsFormControl,
  type ProviderSettingsFormOption,
  type ProviderSettingsFormSchemaAnnotation,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

type ProviderClientDefinition = NonNullable<ReturnType<typeof providerClients.get>>;
type FieldSchema = ProviderClientDefinition["settingsSchema"]["fields"][string];

export interface ProviderField {
  readonly key: string;
  readonly control: ProviderSettingsFormControl;
  readonly label: string;
  readonly description: string | null;
  readonly placeholder: string | null;
  readonly clearWhenEmpty: "omit" | "persist";
  /** Kept in the engine's secret store; the board never shows or edits it. */
  readonly secret: boolean;
  readonly defaultBoolean: boolean | null;
  readonly options: ReadonlyArray<ProviderSettingsFormOption>;
  /** Whether the field's schema takes this typed text; text it rejects is never saved. */
  readonly accepts: (value: string) => boolean;
}

const titleize = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());

const annotationsOf = (field: FieldSchema) =>
  Schema.resolveAnnotationsKey(field) ?? Schema.resolveAnnotations(field);

export const isText = Schema.is(Schema.String);
export const isFlag = Schema.is(Schema.Boolean);

const textAnnotation = (field: FieldSchema, key: "title" | "description") => {
  const value = annotationsOf(field)?.[key];
  return isText(value) ? value : null;
};

const decoderOf = (field: FieldSchema) =>
  // SAFETY: provider settings fields are plain schemas with no decoding services, as T3's own form assumes.
  Schema.decodeUnknownOption(field as Schema.Decoder<unknown>);

/** The settings fields of one driver, in the order its schema asks for, without hidden ones. */
export function providerFields(definition: Pick<ProviderClientDefinition, "settingsSchema">) {
  const schemaAnnotation: ProviderSettingsFormSchemaAnnotation =
    Schema.resolveAnnotations(definition.settingsSchema)?.providerSettingsFormSchema ?? {};
  const order = new Map((schemaAnnotation.order ?? []).map((key, index) => [key, index] as const));
  const keys = Object.keys(definition.settingsSchema.fields);
  const rank = (key: string) => order.get(key) ?? order.size + keys.indexOf(key);
  return keys
    .toSorted((left, right) => rank(left) - rank(right))
    .flatMap((key): ReadonlyArray<ProviderField> => {
      const field = definition.settingsSchema.fields[key];
      if (field === undefined) return [];
      const form: ProviderSettingsFormAnnotation = annotationsOf(field)?.providerSettingsForm ?? {};
      if (form.hidden === true) return [];
      const decode = decoderOf(field);
      return [
        {
          key,
          control: form.control ?? "text",
          label: textAnnotation(field, "title") ?? titleize(key),
          description: textAnnotation(field, "description"),
          placeholder: form.placeholder ?? null,
          clearWhenEmpty: form.clearWhenEmpty ?? "omit",
          secret: isSecretSetting(field),
          defaultBoolean: Option.getOrNull(Option.filter(decode(undefined), isFlag)),
          options: form.control === "select" ? (form.options ?? []) : [],
          accepts: (value) => Option.isSome(decode(value)),
        },
      ];
    });
}

/** A provider instance's config, as the engine stores it. */
export const InstanceConfig = Schema.Record(Schema.String, Schema.Json);
export type InstanceConfig = typeof InstanceConfig.Type;

/** The instance config with one field set, or without it when emptied and the field omits empty values. */
export function withField(
  config: InstanceConfig,
  field: Pick<ProviderField, "key" | "clearWhenEmpty">,
  value: string | boolean,
) {
  if (value === "" && field.clearWhenEmpty === "omit") {
    const { [field.key]: _cleared, ...rest } = config;
    return rest;
  }
  return { ...config, [field.key]: value };
}
