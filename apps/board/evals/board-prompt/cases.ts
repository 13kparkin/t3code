import * as NodeFS from "node:fs";

import { type ReviewTemplate, SYSTEM_TEMPLATE } from "../../src/domain/reviewTemplate";
import { renderFacts, renderRules } from "../../src/orchestrator/brief";
import { ROLE_SPECS } from "../../src/orchestrator/roleSpecs";
import type { PromptInput } from "./check";

const filesIn = (folder: string) =>
  new Set(NodeFS.readdirSync(new URL(`../../${folder}/`, import.meta.url)));

const CUSTOM_TEMPLATE: ReviewTemplate = {
  name: "Author checks only",
  authorChecks: ["simplify"],
  lanes: [],
};

const promptFor = (reviewTemplate: ReviewTemplate) =>
  `${renderRules()}\n\n${renderFacts({
    boardDir: "/home/user/acme/.agentboard/acme",
    builderCap: 2,
    project: "acme/app",
    projectDir: "/home/user/acme",
    reviewTemplate,
    usage: [],
  })}`;

const BOARD: PromptInput = {
  roleNames: ROLE_SPECS.map((role) => role.name),
  roleFiles: filesIn("roles"),
  pstackFiles: filesIn("pstack"),
  prompt: promptFor(SYSTEM_TEMPLATE),
};

const without = (files: ReadonlySet<string>, file: string) =>
  new Set([...files].filter((entry) => entry !== file));

interface PromptCase {
  readonly id: string;
  /** The failure or rule the case comes from. */
  readonly source: string;
  readonly input: PromptInput;
  readonly expected: ReadonlyArray<string>;
}

export const CASES: ReadonlyArray<PromptCase> = [
  {
    id: "system-template",
    source: "The system review template, which every board starts on",
    input: BOARD,
    expected: [],
  },
  {
    id: "custom-template",
    source: "A custom review template with no lanes",
    input: { ...BOARD, prompt: promptFor(CUSTOM_TEMPLATE) },
    expected: [],
  },
  {
    id: "role-without-file",
    source: "T-79 B1: every role in the registry has a role file",
    input: { ...BOARD, roleNames: [...BOARD.roleNames, "planner"] },
    expected: ["role planner has no file roles/planner.md"],
  },
  {
    id: "missing-role-file",
    source: "T-79 B1: every role file the brief names exists in roles/",
    input: { ...BOARD, roleFiles: without(BOARD.roleFiles, "verifier.md") },
    expected: [
      "role verifier has no file roles/verifier.md",
      "the prompt names roles/verifier.md, which roles/ does not have",
    ],
  },
  {
    id: "missing-skill",
    source: "A pstack bump that drops or renames a skill the brief loads",
    input: { ...BOARD, pstackFiles: without(BOARD.pstackFiles, "pstack-t3.md") },
    expected: ["the prompt names skills/pstack-t3/SKILL.md, which pstack/ does not vendor"],
  },
  {
    id: "smoke-name-mismatch",
    source: "T-79 B1: smoke.txt vs verify-smoke.txt",
    input: { ...BOARD, prompt: BOARD.prompt.replaceAll("`smoke.txt`", "`verify-smoke.txt`") },
    expected: [
      "`smoke_named` names no file the gate reads (smoke.txt)",
      "the prompt names verify-smoke.txt, but the gate reads smoke.txt",
    ],
  },
  {
    id: "ci-local-name-mismatch",
    source: "T-79 failure 5: ci_green claimed from a ci-local.txt the board could not find",
    input: {
      ...BOARD,
      prompt: BOARD.prompt.replaceAll("save `ci-local.txt` in", "save `ci-run.txt` in"),
    },
    expected: ["the prompt names ci-run.txt, but the gate reads ci-local.txt"],
  },
  {
    id: "readme-name-mismatch",
    source: "T-79 failure 2: readmes_pass claimed with no readme-check file",
    input: { ...BOARD, prompt: BOARD.prompt.replaceAll("`readme-check", "`readme-review") },
    expected: [
      "`readmes_pass` names no file the gate reads (a name matching /readmes?[-_ ]?(check|pass|lint)/i)",
      "the prompt names readme-review.txt, but the gate reads a name matching /readmes?[-_ ]?(check|pass|lint)/i",
    ],
  },
];
