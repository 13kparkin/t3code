import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import * as NodeURL from "node:url";

const SCRIPT = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "ci-local.mjs",
);
// A PATH without vp, so the checks fail at once instead of running for real.
const ENV = {
  ...process.env,
  PATH: "/usr/bin:/bin",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

NodeTest.test(
  "Given a ticket key and its evidence folder, When local CI runs, Then ci-local.txt lands in that folder and not in the worktree",
  () => {
    const temp = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-ci-local-"));
    const repo = NodePath.join(temp, "repo");
    const evidence = NodePath.join(temp, "board", "artifacts", "T-1");
    const git = (...args) =>
      NodeChildProcess.execFileSync(
        "git",
        ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
        { cwd: repo, env: ENV, encoding: "utf8" },
      ).trim();
    try {
      NodeFS.mkdirSync(repo);
      git("init", "-q", "-b", "main");
      git("commit", "-q", "--allow-empty", "-m", "start");
      git("remote", "add", "upstream", NodePath.join(temp, "missing.git"));
      const result = NodeChildProcess.spawnSync(process.execPath, [SCRIPT, "T-1", evidence], {
        cwd: repo,
        env: ENV,
        encoding: "utf8",
      });
      NodeAssert.equal(result.status, 1, result.stderr);
      const lines = NodeFS.readFileSync(NodePath.join(evidence, "ci-local.txt"), "utf8").split(
        "\n",
      );
      NodeAssert.equal(lines[0], git("rev-parse", "HEAD"));
      NodeAssert.ok(lines.includes("upstream-exit=128"));
      NodeAssert.equal(NodeFS.existsSync(NodePath.join(repo, ".omp")), false);
    } finally {
      NodeFS.rmSync(temp, { recursive: true, force: true });
    }
  },
);
