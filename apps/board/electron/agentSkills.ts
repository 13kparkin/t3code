import type { LinuxHost } from "./wslEngine";

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * The SKILL.md files under `<project>/.agents/skills` and `~/.agents/skills` in WSL, project first.
 * Each is a record separator, its absolute path, a newline, and its first 2 KB.
 */
export async function listAgentSkills(
  host: Pick<LinuxHost, "shell">,
  projectRoot: string,
): Promise<string> {
  const roots = [
    ...(projectRoot.startsWith("/") ? [`${quote(projectRoot)}/.agents/skills`] : []),
    `"$HOME/.agents/skills"`,
  ];
  const script = [
    `for root in ${roots.join(" ")}; do`,
    `  for file in "$root"/*/SKILL.md; do`,
    `    [ -f "$file" ] || continue`,
    `    printf '\\036%s\\n' "$file"`,
    `    head -c 2048 "$file"`,
    `  done`,
    `done`,
    ``,
  ].join("\n");
  const result = await host.shell(script, { timeoutMs: 10_000 });
  return result.exitCode === 0 ? result.stdout : "";
}
