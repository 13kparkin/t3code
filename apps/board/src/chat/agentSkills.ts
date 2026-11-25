import type { ServerProviderSkill } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { engineBridge } from "../connection/bridge";

/** The scope the board gives a skill from an `.agents/skills` folder, which the provider never lists. */
export const AGENTS_SCOPE = ".agents";

const RECORD = "\u001e";

const field = (head: string, name: string) =>
  new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, "m").exec(head)?.[1];

/** Reads the main process's listing into skills. The first folder to name a skill wins, so the project's beats the home's. */
export function parseAgentSkills(listing: string): ReadonlyArray<ServerProviderSkill> {
  const byName = new Map<string, ServerProviderSkill>();
  for (const record of listing.split(RECORD).slice(1)) {
    const newline = record.indexOf("\n");
    const path = (newline === -1 ? record : record.slice(0, newline)).trim();
    const head = newline === -1 ? "" : record.slice(newline + 1);
    const name = field(head, "name") ?? path.split("/").at(-2) ?? "";
    const description = field(head, "description");
    if (name === "" || byName.has(name)) continue;
    byName.set(name, {
      name,
      path,
      scope: AGENTS_SCOPE,
      enabled: true,
      ...(description === undefined ? {} : { description }),
    });
  }
  return [...byName.values()];
}

/** The provider's own skills, then each `.agents` skill whose name the provider does not already use. */
export function mergeSkills(
  provider: ReadonlyArray<ServerProviderSkill>,
  agents: ReadonlyArray<ServerProviderSkill>,
): ReadonlyArray<ServerProviderSkill> {
  if (agents.length === 0) return provider;
  const taken = new Set(provider.map((skill) => skill.name));
  return [...provider, ...agents.filter((skill) => !taken.has(skill.name))];
}

/** What a picked `.agents` skill inserts, because Claude Code loads skills by name only from `.claude`. */
export const agentSkillPrompt = (skill: ServerProviderSkill) =>
  `Read ${skill.path} in full and follow it as the ${skill.name} skill.`;

/** A project's `.agents` skills, then the WSL home's, read once per project root. */
export const agentSkillsAtom = Atom.family((projectRoot: string) =>
  Atom.make((get): ReadonlyArray<ServerProviderSkill> => {
    void engineBridge
      .listAgentSkills(projectRoot)
      .then((listing) => get.setSelf(parseAgentSkills(listing)));
    return [];
  }).pipe(Atom.keepAlive, Atom.withLabel(`agent-skills:${projectRoot}`)),
);
