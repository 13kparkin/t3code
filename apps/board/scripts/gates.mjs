// The checks a board change must pass, shared by release.mjs, release-phone.mjs and ci-local.mjs so they cannot drift.
// `cwd` is relative to the repo root.
import * as NodeChildProcess from "node:child_process";

export function addUpstreamRemote(root) {
  try {
    NodeChildProcess.execFileSync("git", ["remote", "get-url", "upstream"], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    NodeChildProcess.execFileSync(
      "git",
      ["remote", "add", "upstream", "https://github.com/pingdotgg/t3code.git"],
      { cwd: root },
    );
  }
}

/** Refuses a release from a tagged, dirty or unpushed checkout, and returns the commit to release. */
export function releaseSha({ root, tag, version, prerelease, prereleaseHint }) {
  const git = (...args) =>
    NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const fail = (message) => {
    console.error(message);
    process.exit(1);
  };
  if (git("ls-remote", "--tags", "origin", `refs/tags/${tag}`) !== "") {
    fail(`The tag ${tag} already exists, so ${version} is already released.`);
  }
  NodeChildProcess.execFileSync("git", ["fetch", "--no-tags", "origin", "main"], {
    cwd: root,
    stdio: "inherit",
  });
  const sha = git("rev-parse", "HEAD");
  if (git("status", "--porcelain") !== "") fail("The checkout has uncommitted changes.");
  if (!prerelease && sha !== git("rev-parse", "origin/main")) {
    fail(`A release comes from origin/main. Check it out, or ${prereleaseHint}`);
  }
  if (git("branch", "-r", "--contains", sha) === "") {
    fail(`${sha} is not pushed, and the release is created on GitHub's copy of it.`);
  }
  return sha;
}

/** The engine gate diffs against upstream/main, so it runs after this fetch. */
export const UPSTREAM_FETCH = {
  name: "upstream",
  command: "git",
  args: ["fetch", "--no-tags", "--filter=blob:none", "upstream", "main"],
};

const CALL_CAPTURE = ["--manifest-path", "apps/board/native/call-capture/Cargo.toml"];

/** The same gates as the agent-board job. */
export const GATES = [
  { name: "engine", command: "node", args: ["apps/board/scripts/check-engine-untouched.mjs"] },
  { name: "diagnostics", command: "node", args: ["standards/check-added-diagnostics.mjs"] },
  { name: "deps", command: "vp", args: ["run", "--filter", "@agent-board/app", "standards:deps"] },
  {
    name: "node-tests",
    command: "node",
    args: [
      "--test",
      "apps/board/scripts/*.test.mjs",
      "apps/board/plugins/**/*.test.mjs",
      "standards/**/*.test.mjs",
    ],
  },
  { name: "typecheck", command: "vp", args: ["run", "--filter", "@agent-board/app", "typecheck"] },
  { name: "board-suite", command: "vp", args: ["test", "run"], cwd: "apps/board" },
  {
    name: "phone-typecheck",
    command: "vp",
    args: ["run", "--filter", "@agent-board/phone", "typecheck"],
  },
  { name: "phone-test", command: "vp", args: ["run", "--filter", "@agent-board/phone", "test"] },
  { name: "call-capture-test", command: "cargo", args: ["test", "--locked", ...CALL_CAPTURE] },
  {
    name: "call-capture-check",
    command: "cargo",
    args: ["check", "--locked", "--target", "x86_64-pc-windows-msvc", ...CALL_CAPTURE],
  },
];
