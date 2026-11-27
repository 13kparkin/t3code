import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import * as NodeURL from "node:url";

import { releaseCommands, sha256sumsLine } from "./release-phone.mjs";

const SCRIPT = NodeURL.fileURLToPath(new URL("./release-phone.mjs", import.meta.url));
const ORIGIN_URL = "https://github.com/owner/board.git";

const git = (cwd, ...args) =>
  NodeChildProcess.execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" },
  );

function checkout(t) {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "release-phone-"));
  t.after(() => NodeFS.rmSync(dir, { recursive: true, force: true }));
  const origin = NodePath.join(dir, "origin.git");
  const work = NodePath.join(dir, "work");
  git(dir, "init", "--quiet", "--bare", "-b", "main", origin);
  git(dir, "init", "--quiet", "-b", "main", work);
  git(work, "config", `url.${origin}.insteadOf`, ORIGIN_URL);
  git(work, "remote", "add", "origin", ORIGIN_URL);
  NodeFS.writeFileSync(NodePath.join(work, "README.md"), "board\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "init");
  git(work, "push", "--quiet", "origin", "main");
  return work;
}

const dryRun = (cwd, version) =>
  NodeChildProcess.spawnSync("node", [SCRIPT, version, "--dry-run"], { cwd, encoding: "utf8" });

NodeTest.test("a release runs the phone gates, the signed build, apksigner, notes and gh", () => {
  const release = releaseCommands({
    version: "1.2.3-test",
    root: "/repo",
    sha: "abc123",
    repository: "owner/board",
    apksigner: "/sdk/build-tools/36.0.0/apksigner",
  });
  const apk = "/repo/apps/board/mobile/release/Agent-Board-Phone-1.2.3-test.apk";
  const notes = "/repo/apps/board/mobile/release/release-notes.md";
  NodeAssert.deepEqual(
    [...release.build, release.verify, ...release.publish].map(({ command, args, env }) => [
      command,
      ...args,
      ...(env ? [env] : []),
    ]),
    [
      ["vp", "run", "--filter", "@agent-board/phone", "typecheck"],
      ["vp", "run", "--filter", "@agent-board/phone", "test"],
      [
        "pnpm",
        "exec",
        "expo",
        "prebuild",
        "--clean",
        "--platform",
        "android",
        "--no-install",
        {
          APP_VARIANT: "production",
          EXPO_NO_GIT_STATUS: "1",
          AGENT_BOARD_PHONE_VERSION: "1.2.3-test",
          AGENT_BOARD_PHONE_VERSION_CODE: "1002003",
        },
      ],
      [
        "./gradlew",
        ":app:assembleRelease",
        "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a",
        "--max-workers=2",
        "-Dorg.gradle.jvmargs=-Xmx2g",
        "--no-daemon",
      ],
      ["/sdk/build-tools/36.0.0/apksigner", "verify", "--print-certs", apk],
      [
        "node",
        "apps/board/scripts/release-notes.mjs",
        "--repository",
        "owner/board",
        "--tag",
        "board-phone-v1.2.3-test",
        "--ref",
        "abc123",
        "--output",
        notes,
      ],
      [
        "gh",
        "release",
        "create",
        "board-phone-v1.2.3-test",
        "--repo",
        "owner/board",
        "--target",
        "abc123",
        "--title",
        "Agent Board Phone 1.2.3-test",
        "--notes-file",
        notes,
        "--latest=false",
        "--prerelease",
        apk,
        "/repo/apps/board/mobile/release/SHA256SUMS",
      ],
    ],
  );
});

NodeTest.test("a dirty checkout is refused with the files named", (t) => {
  const work = checkout(t);
  NodeFS.writeFileSync(NodePath.join(work, "stray.txt"), "x\n");
  const result = dryRun(work, "0.1.0-test");
  NodeAssert.equal(result.status, 1);
  NodeAssert.equal(result.stderr, "The checkout has uncommitted changes:\n?? stray.txt\n");
});

NodeTest.test("a version whose tag exists on origin is refused", (t) => {
  const work = checkout(t);
  git(work, "tag", "board-phone-v0.1.0");
  git(work, "push", "--quiet", "origin", "board-phone-v0.1.0");
  const result = dryRun(work, "0.1.0");
  NodeAssert.equal(result.status, 1);
  NodeAssert.equal(
    result.stderr,
    "The tag board-phone-v0.1.0 already exists, so 0.1.0 is already released.\n",
  );
});

NodeTest.test("SHA256SUMS holds the hash and the asset name", (t) => {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "release-phone-sums-"));
  t.after(() => NodeFS.rmSync(dir, { recursive: true, force: true }));
  const apk = NodePath.join(dir, "Agent-Board-Phone-0.1.0.apk");
  NodeFS.writeFileSync(apk, "agent board\n");
  NodeAssert.equal(
    sha256sumsLine(apk),
    "de222ce948916db5c20da6efc782436544c1c2dd5b8f45068e3073a60e24437f  Agent-Board-Phone-0.1.0.apk\n",
  );
});
