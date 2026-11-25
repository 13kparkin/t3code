#!/usr/bin/env node
// Runs local CI on HEAD and writes ci-local.txt, which the board reads for ci_green. Line 1 is the
// head SHA, and each step ends in `<step>-exit=<code>`. It runs every step, even after one fails.
// Usage: node apps/board/scripts/ci-local.mjs <ticket key> <evidence folder>, where the folder is the
// board's `artifacts/<ticket key>/`, since a builder's worktree does not hold the board folder.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { addUpstreamRemote, GATES, UPSTREAM_FETCH } from "./gates.mjs";

const [key, evidence] = process.argv.slice(2);
if (!/^[A-Za-z][\w-]*$/.test(key ?? "") || NodePath.basename(evidence ?? "") !== key) {
  console.error("Usage: node apps/board/scripts/ci-local.mjs <ticket key> <evidence folder>");
  process.exit(1);
}

const git = (args) => NodeChildProcess.execFileSync("git", args, { encoding: "utf8" }).trim();
const root = git(["rev-parse", "--show-toplevel"]);
const sha = git(["rev-parse", "HEAD"]);
// The file vouches for HEAD, so uncommitted edits would make it vouch for code HEAD lacks.
if (git(["status", "--porcelain"]) !== "") {
  console.error("Commit or stash your changes first, since the run is recorded against HEAD.");
  process.exit(1);
}
addUpstreamRemote(root);

const steps = [
  UPSTREAM_FETCH,
  { name: "check-changed", command: "vp", args: ["run", "check:changed"] },
  ...GATES,
];

const TAIL_CHARS = 32_000;
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
  const output = [result.stdout, result.stderr, result.error?.message ?? ""]
    .filter((part) => part !== "")
    .join("\n");
  console.log(output);
  // The board reads at most 1 MiB of the file, and a step's summary and errors sit at its end.
  const kept =
    output.length > TAIL_CHARS
      ? `[${output.length - TAIL_CHARS} characters cut]\n${output.slice(-TAIL_CHARS)}`
      : output;
  const block = `=== ${step.name}: ${[step.command, ...step.args].join(" ")} ===\n${kept}\n${step.name}-exit=${code}`;
  console.log(`${step.name}-exit=${code}`);
  lines.push(block);
}

const output = NodePath.resolve(evidence, "ci-local.txt");
NodeFS.mkdirSync(NodePath.dirname(output), { recursive: true });
// Written whole at the end, so a run cut short never leaves a file whose exit lines all pass.
NodeFS.writeFileSync(`${output}.tmp`, `${lines.join("\n")}\n`);
NodeFS.renameSync(`${output}.tmp`, output);
console.log(`wrote ${output}`);
process.exit(failed ? 1 : 0);
