#!/usr/bin/env node
// Runs local CI on HEAD for a fork with no CI on pull requests, and writes the ticket's ci-local.txt,
// which the board reads for the ci_green condition: the head SHA on line 1, then each step's output
// ending in `<step>-exit=<code>`. It runs every step, even after one fails.
// Usage: node apps/board/scripts/ci-local.mjs <ticket key>
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { addUpstreamRemote, GATES, UPSTREAM_FETCH } from "./gates.mjs";

const key = process.argv[2];
if (!/^[A-Za-z][\w-]*$/.test(key ?? "")) {
  console.error("Usage: node apps/board/scripts/ci-local.mjs <ticket key>");
  process.exit(1);
}

const git = (args) => NodeChildProcess.execFileSync("git", args, { encoding: "utf8" }).trim();
const root = git(["rev-parse", "--show-toplevel"]);
const sha = git(["rev-parse", "HEAD"]);
addUpstreamRemote(root);

const steps = [
  { name: "upstream", command: UPSTREAM_FETCH[0], args: UPSTREAM_FETCH[1] },
  { name: "check-changed", command: "vp", args: ["run", "check:changed"] },
  ...GATES,
];

const lines = [sha];
let failed = false;
for (const step of steps) {
  const result = NodeChildProcess.spawnSync(step.command, step.args, {
    cwd: NodePath.join(root, step.cwd ?? ""),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const code = result.status ?? 1;
  failed ||= code !== 0;
  const block = [
    `=== ${step.name}: ${[step.command, ...step.args].join(" ")} ===`,
    result.stdout,
    result.stderr,
    result.error?.message ?? "",
    `${step.name}-exit=${code}`,
  ]
    .filter((part) => part !== "")
    .join("\n");
  console.log(block);
  lines.push(block);
}

const output = NodePath.join(root, ".omp", "artifacts", key, "ci-local.txt");
NodeFS.mkdirSync(NodePath.dirname(output), { recursive: true });
// Written whole at the end, so a run cut short never leaves a file whose exit lines all pass.
NodeFS.writeFileSync(`${output}.tmp`, `${lines.join("\n")}\n`);
NodeFS.renameSync(`${output}.tmp`, output);
console.log(`wrote ${output}`);
process.exit(failed ? 1 : 0);
