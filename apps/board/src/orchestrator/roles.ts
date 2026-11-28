import type { RoleOverride } from "../domain/board";
import { ROLE_SPECS, type RoleSpec } from "./roleSpecs";

export interface Role extends RoleSpec {
  /** One line, from the role file's front matter. */
  readonly description: string;
  readonly file: string;
}

const ROLE_SOURCES = import.meta.glob<string>("../../roles/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The role files, by file name. */
export const roleFiles: ReadonlyMap<string, string> = new Map(
  Object.entries(ROLE_SOURCES).map(([path, text]) => [path.slice(path.lastIndexOf("/") + 1), text]),
);

function descriptionOf(file: string): string {
  const text = roleFiles.get(file);
  const line = text?.split("\n").find((entry) => entry.startsWith("description:"));
  if (line === undefined) throw new Error(`${file} has no description in its front matter`);
  return JSON.parse(line.slice("description:".length).trim());
}

export const ROLES: ReadonlyArray<Role> = ROLE_SPECS.map((role) => ({
  ...role,
  file: `${role.name}.md`,
  description: descriptionOf(`${role.name}.md`),
}));

export interface RoleTarget {
  /** The instance the child runs on. It names the picked instance, never the orchestrator instance, which would give the child the orchestrator's rules. */
  readonly providerInstanceId?: string;
  /** Left out when the child takes the orchestrator's model. */
  readonly model?: string;
  readonly effort?: string;
}

export interface ResolvedRole extends Role {
  readonly target: RoleTarget;
  /** Why the role does not use its own model, or null. */
  readonly fallback: string | null;
}

export interface OrchestratorModel {
  readonly instanceId: string;
  /** The slugs the orchestrator's instance offers. */
  readonly offered: ReadonlyArray<string>;
}

/**
 * Each role keeps its Claude model when the orchestrator's instance offers it. A Claude model the
 * instance does not offer falls back to the orchestrator's model. Every target names the picked instance.
 */
export function resolveRoles(
  roles: ReadonlyArray<Role>,
  orchestrator: OrchestratorModel,
): ReadonlyArray<ResolvedRole> {
  return roles.map((role): ResolvedRole => {
    const inherited = { providerInstanceId: orchestrator.instanceId };
    if (!orchestrator.offered.includes(role.model.slug)) {
      return {
        ...role,
        target: inherited,
        fallback: `${role.model.slug} is not offered by ${orchestrator.instanceId}, so it uses the orchestrator's model`,
      };
    }
    return {
      ...role,
      target: {
        providerInstanceId: orchestrator.instanceId,
        model: role.model.slug,
        effort: role.model.effort,
      },
      fallback: null,
    };
  });
}

/** The registry with each role on its own model, before any instance is known. */
export const DEFAULT_ROLES: ReadonlyArray<ResolvedRole> = ROLES.map((role) => ({
  ...role,
  target: { model: role.model.slug, effort: role.model.effort },
  fallback: null,
}));

/** The parts of a provider instance a role target is checked against. A picker's instance fits it. */
export interface RoleInstance {
  readonly instanceId: string;
  readonly offered: ReadonlyArray<string>;
  readonly models: ReadonlyArray<{
    readonly slug: string;
    readonly effort: { readonly choices: ReadonlyArray<{ readonly id: string }> } | null;
  }>;
}

/** Why `role` cannot run on this model and effort, or null when it can. A null pick, the registry's default, needs only a known role. */
export function roleTargetProblem(
  role: string,
  pick: RoleOverride | null,
  instance: RoleInstance | null,
): string | null {
  if (!ROLES.some((entry) => entry.name === role)) return `${role} is not a role in the registry.`;
  if (pick === null) return null;
  if (instance === null) return "No provider is running to check the model against.";
  if (!instance.offered.includes(pick.model)) {
    return `${instance.instanceId} does not offer ${pick.model}.`;
  }
  if (pick.effort === undefined) return null;
  const choices =
    instance.models
      .find((model) => model.slug === pick.model)
      ?.effort?.choices.map((choice) => choice.id) ?? [];
  return choices.includes(pick.effort)
    ? null
    : `${pick.model} has no effort ${pick.effort}. Pick one of ${choices.join(", ") || "none"}.`;
}
