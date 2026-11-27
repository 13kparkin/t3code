#!/usr/bin/env node
// Cuts a signed phone APK release on GitHub. Run it in WSL with JDK 17 in JAVA_HOME, the Android SDK in
// ANDROID_HOME, and a clean, pushed checkout. A suffixed version, such as 0.2.0-test, is a pre-release from any branch.
// Usage: node apps/board/scripts/release-phone.mjs <version> [--dry-run]
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

import { GATES } from "./gates.mjs";

const SIGNING_PROPERTIES = [
  "AGENT_BOARD_PHONE_KEYSTORE",
  "AGENT_BOARD_PHONE_KEY_ALIAS",
  "AGENT_BOARD_PHONE_STORE_PASSWORD",
  "AGENT_BOARD_PHONE_KEY_PASSWORD",
];

/** Android refuses an update with a lower versionCode, so 1.2.3 becomes 1002003. */
const versionCode = (version) => {
  const [major, minor, patch] = version.split(/[.-]/).map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
};

export function sha256sumsLine(file) {
  const hash = NodeCrypto.createHash("sha256").update(NodeFS.readFileSync(file)).digest("hex");
  return `${hash}  ${NodePath.basename(file)}\n`;
}

export function releaseCommands({ version, root, sha, repository, apksigner }) {
  const mobile = NodePath.join(root, "apps", "board", "mobile");
  const releaseDir = NodePath.join(mobile, "release");
  const tag = `board-phone-v${version}`;
  const prerelease = version.includes("-");
  const notes = NodePath.join(releaseDir, "release-notes.md");
  const apk = NodePath.join(releaseDir, `Agent-Board-Phone-${version}.apk`);
  const sums = NodePath.join(releaseDir, "SHA256SUMS");
  return {
    apk,
    sums,
    builtApk: NodePath.join(mobile, "android/app/build/outputs/apk/release/app-release.apk"),
    build: [
      ...GATES.filter((gate) => gate.name.startsWith("phone-")).map((gate) => ({
        command: gate.command,
        args: gate.args,
        cwd: root,
      })),
      {
        command: "pnpm",
        args: ["exec", "expo", "prebuild", "--clean", "--platform", "android", "--no-install"],
        cwd: mobile,
        env: {
          APP_VARIANT: "production",
          EXPO_NO_GIT_STATUS: "1",
          AGENT_BOARD_PHONE_VERSION: version,
          AGENT_BOARD_PHONE_VERSION_CODE: String(versionCode(version)),
        },
      },
      {
        command: "./gradlew",
        args: [
          ":app:assembleRelease",
          "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a",
          "--max-workers=2",
          "-Dorg.gradle.jvmargs=-Xmx2g",
          "--no-daemon",
        ],
        cwd: NodePath.join(mobile, "android"),
      },
    ],
    verify: { command: apksigner, args: ["verify", "--print-certs", apk], cwd: root },
    publish: [
      {
        command: "node",
        args: [
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
        cwd: root,
      },
      {
        command: "gh",
        args: [
          "release",
          "create",
          tag,
          "--repo",
          repository,
          "--target",
          sha,
          "--title",
          `Agent Board Phone ${version}`,
          "--notes-file",
          notes,
          // Keeps the Releases page's Latest badge on the desktop app.
          "--latest=false",
          ...(prerelease ? ["--prerelease"] : []),
          apk,
          sums,
        ],
        cwd: root,
      },
    ],
  };
}

const out = (command, args, cwd) =>
  NodeChildProcess.execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
const run = ({ command, args, cwd, env }) =>
  NodeChildProcess.execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

function gradleProperties() {
  const home = process.env["GRADLE_USER_HOME"] ?? NodePath.join(NodeOS.homedir(), ".gradle");
  try {
    return NodeFS.readFileSync(NodePath.join(home, "gradle.properties"), "utf8");
  } catch {
    return "";
  }
}

function main() {
  const { positionals, values } = NodeUtil.parseArgs({
    allowPositionals: true,
    options: { "dry-run": { type: "boolean", default: false } },
  });
  const version = positionals[0];
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
    fail("Usage: node apps/board/scripts/release-phone.mjs <version> [--dry-run]");
  }

  const root = out("git", ["rev-parse", "--show-toplevel"]);
  // The raw URL, since `git remote get-url` applies insteadOf rewrites.
  const repository = out("git", ["config", "--get", "remote.origin.url"], root).match(
    /github\.com[:/](.+?)(?:\.git)?$/,
  )?.[1];
  if (!repository) fail("origin is not a GitHub remote");

  const dirty = out("git", ["status", "--porcelain"], root);
  if (dirty !== "") fail(`The checkout has uncommitted changes:\n${dirty}`);
  const tag = `board-phone-v${version}`;
  const prerelease = version.includes("-");
  if (out("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], root) !== "") {
    fail(`The tag ${tag} already exists, so ${version} is already released.`);
  }
  run({ command: "git", args: ["fetch", "--no-tags", "origin", "main"], cwd: root });
  const sha = out("git", ["rev-parse", "HEAD"], root);
  if (!prerelease && sha !== out("git", ["rev-parse", "origin/main"], root)) {
    fail(
      "A release comes from origin/main. Check it out, or give a -test version for a pre-release.",
    );
  }
  if (out("git", ["branch", "-r", "--contains", sha], root) === "") {
    fail(`${sha} is not pushed, and the release is created on GitHub's copy of it.`);
  }

  const properties = gradleProperties();
  const missing = SIGNING_PROPERTIES.filter(
    (name) =>
      !process.env[`ORG_GRADLE_PROJECT_${name}`] &&
      !new RegExp(`^\\s*${name}\\s*[=:]`, "m").test(properties),
  );
  if (missing.length > 0) {
    fail(
      `Set ${missing.join(", ")} in ~/.gradle/gradle.properties. apps/board/README.md says how.`,
    );
  }
  const androidHome = process.env["ANDROID_HOME"];
  if (!androidHome) fail("Set ANDROID_HOME to the Android SDK.");
  const release = releaseCommands({
    version,
    root,
    sha,
    repository,
    // apksigner 37 prints the digest as `V2 Signer: ...`; 36.0.0 prints `Signer #1 certificate SHA-256 digest`.
    apksigner: NodePath.join(androidHome, "build-tools", "36.0.0", "apksigner"),
  });
  for (const step of release.build) run(step);
  NodeFS.rmSync(NodePath.dirname(release.apk), { recursive: true, force: true });
  NodeFS.mkdirSync(NodePath.dirname(release.apk), { recursive: true });
  NodeFS.copyFileSync(release.builtApk, release.apk);
  const certificates = out(release.verify.command, release.verify.args, release.verify.cwd);
  const sums = sha256sumsLine(release.apk);
  NodeFS.writeFileSync(release.sums, sums);
  console.log(`APK: ${release.apk}`);
  console.log(`SHA-256: ${sums.split(" ")[0]}`);
  console.log(certificates);

  if (values["dry-run"]) {
    console.log("Dry run. These would run next:");
    for (const { command, args } of release.publish) {
      const quoted = args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg));
      console.log(`  ${command} ${quoted.join(" ")}`);
    }
    return;
  }
  for (const step of release.publish) run(step);
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) main();
