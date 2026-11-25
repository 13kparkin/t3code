import type { ServerProviderSkill } from "@t3tools/contracts";

/** The scope the board gives a skill from an `.agents/skills` folder, which the provider never lists. */
export const AGENTS_SCOPE = ".agents";

const RECORD = "\u001e";

/** A front-matter field, with a `|` or `>` block's indented lines joined into one line. */
function field(head: string, name: string): string | undefined {
  const lines = head.split("\n");
  const at = lines.findIndex((line) => line.startsWith(`${name}:`));
  if (at === -1) return undefined;
  const value = (lines[at] ?? "")
    .slice(name.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!/^[|>][-+]?$/.test(value)) return value === "" ? undefined : value;
  const block: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break;
    block.push(line.trim());
  }
  return block.length === 0 ? undefined : block.join(" ");
}

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
