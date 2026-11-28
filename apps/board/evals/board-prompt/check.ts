import { CI_LOCAL_FILE, README_CHECK, SMOKE_FILE } from "../../src/domain/readiness";

export interface PromptInput {
  /** The registry's role names. */
  readonly roleNames: ReadonlyArray<string>;
  /** The file names in `roles/`. */
  readonly roleFiles: ReadonlySet<string>;
  /** The file names in `pstack/`, one per vendored skill. */
  readonly pstackFiles: ReadonlySet<string>;
  /** The orchestrator's rules and a board's facts, as rendered. */
  readonly prompt: string;
}

/** Each gated evidence file: its condition, a pattern any name meant for it has, and the name or names the gate reads. */
const EVIDENCE: ReadonlyArray<{ condition: string; stem: RegExp; file: string | RegExp }> = [
  { condition: "ci_green", stem: /\bci\b/, file: CI_LOCAL_FILE },
  { condition: "smoke_named", stem: /smoke/, file: SMOKE_FILE },
  { condition: "readmes_pass", stem: /readme/, file: README_CHECK },
];

const backticked = (text: string) =>
  [...text.matchAll(/`([^`\s]+)`/g)].map((match) => match[1] ?? "");

/** What is wrong with the prompt, one line each, or nothing when it passes. */
export function checkPrompt({ roleNames, roleFiles, pstackFiles, prompt }: PromptInput): string[] {
  const problems = new Set<string>();
  for (const name of roleNames) {
    if (!roleFiles.has(`${name}.md`)) problems.add(`role ${name} has no file roles/${name}.md`);
  }
  for (const [, name] of prompt.matchAll(/\broles\/([a-z0-9-]+)\.md/g)) {
    if (!roleFiles.has(`${name}.md`)) {
      problems.add(`the prompt names roles/${name}.md, which roles/ does not have`);
    }
  }
  for (const [, name] of prompt.matchAll(/\bskills\/([a-z0-9-]+)\/SKILL\.md/g)) {
    if (!pstackFiles.has(`${name}.md`)) {
      problems.add(`the prompt names skills/${name}/SKILL.md, which pstack/ does not vendor`);
    }
  }
  const names = backticked(prompt);
  for (const { condition, stem, file } of EVIDENCE) {
    const reads = (name: string) => (file instanceof RegExp ? file.test(name) : name === file);
    const label = file instanceof RegExp ? `a name matching ${file}` : file;
    const line = new RegExp(`^- \`${condition}\`:(.*)$`, "m").exec(prompt)?.[1] ?? "";
    if (!backticked(line).some(reads))
      problems.add(`\`${condition}\` names no file the gate reads (${label})`);
    for (const name of names) {
      if (name.endsWith(".txt") && stem.test(name) && !reads(name)) {
        problems.add(`the prompt names ${name}, but the gate reads ${label}`);
      }
    }
  }
  return [...problems];
}
