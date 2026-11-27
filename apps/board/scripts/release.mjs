#!/usr/bin/env node
// Cuts a GitHub release of the board: gates, build, installer, SHA256SUMS, notes, release.
// Run it from a clean checkout of origin/main, or of a pushed branch for a test pre-release.
// Usage: node apps/board/scripts/release.mjs <version> [--prerelease]
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { addUpstreamRemote, GATES, releaseSha, UPSTREAM_FETCH } from "./gates.mjs";

const { positionals, values } = NodeUtil.parseArgs({
  allowPositionals: true,
  options: { prerelease: { type: "boolean", default: false } },
});
const version = positionals[0];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error("Usage: node apps/board/scripts/release.mjs <version> [--prerelease]");
  process.exit(1);
}
const tag = `board-v${version}`;

const out = (command, args, cwd) =>
  NodeChildProcess.execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
const run = (command, args, cwd) =>
  NodeChildProcess.execFileSync(command, args, { cwd, stdio: "inherit" });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const root = out("git", ["rev-parse", "--show-toplevel"]);
const boardDir = NodePath.join(root, "apps", "board");
const releaseDir = NodePath.join(boardDir, "release");
const repository = out("git", ["remote", "get-url", "origin"]).match(
  /github\.com[:/](.+?)(?:\.git)?$/,
)?.[1];
if (!repository) fail("origin is not a GitHub remote");

const sha = releaseSha({
  root,
  tag,
  version,
  prerelease: values.prerelease,
  prereleaseHint: "pass --prerelease for a test release.",
});

addUpstreamRemote(root);
for (const gate of [UPSTREAM_FETCH, ...GATES]) {
  run(gate.command, gate.args, NodePath.join(root, gate.cwd ?? ""));
}

run("vp", ["run", "--filter", "@agent-board/app", "build"], root);
NodeFS.rmSync(releaseDir, { recursive: true, force: true });
run("pnpm", ["run", "package", `-c.extraMetadata.version=${version}`], boardDir);

const assets = [`Agent-Board-Setup-${version}.exe`];
NodeFS.writeFileSync(
  NodePath.join(releaseDir, "SHA256SUMS"),
  assets
    .map((name) => {
      const hash = NodeCrypto.createHash("sha256");
      hash.update(NodeFS.readFileSync(NodePath.join(releaseDir, name)));
      return `${hash.digest("hex")}  ${name}\n`;
    })
    .join(""),
);

const notes = NodePath.join(releaseDir, "release-notes.md");
run(
  "node",
  [
    "apps/board/scripts/release-notes.mjs",
    "--repository",
    repository,
    "--tag",
    tag,
    "--ref",
    sha,
    "--output",
    notes,
  ],
  root,
);

run(
  "gh",
  [
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--target",
    sha,
    "--title",
    `Agent Board ${version}`,
    "--notes-file",
    notes,
    ...(values.prerelease ? ["--prerelease"] : []),
    // latest.yml and the blockmap are what the installed app's updater downloads.
    ...[...assets, "SHA256SUMS", "latest.yml", `${assets[0]}.blockmap`].map((name) =>
      NodePath.join(releaseDir, name),
    ),
  ],
  root,
);
