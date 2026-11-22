import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SETUP_SCRIPT } from "./defaultSetupScript";

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  NodeChildProcess.execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );

function repo(files: Record<string, string>) {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-setup-"));
  const root = NodePath.join(dir, "main");
  for (const [name, text] of Object.entries(files)) {
    NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, name)), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, name), text);
  }
  git(dir, "init", "-q", "-b", "main", root);
  git(root, "add", ".");
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
  const worktree = NodePath.join(dir, "wt");
  git(root, "worktree", "add", "-q", "-b", "wt", worktree);
  return { dir, root, worktree };
}

// The engine types the command into the user's shell in the worktree with these variables set.
function runSetup(root: string, worktree: string, env: Record<string, string> = {}) {
  return NodeChildProcess.spawnSync(DEFAULT_SETUP_SCRIPT, {
    cwd: worktree,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, T3CODE_PROJECT_ROOT: root, T3CODE_WORKTREE_PATH: worktree, ...env },
  });
}

// POSIX only, because the engine runs in WSL or Linux and the stub package manager is a sh script.
describe("the default setup script", () => {
  it("Given ignored .env files in the main checkout, when setup runs, then it links them, keeps the worktree's own, and installs from the lockfile", () => {
    const { dir, root, worktree } = repo({
      ".gitignore": ".env*\n!.env.example\nnode_modules/\nlocal.txt\n",
      ".env.example": "SAMPLE=1\n",
      "infra/README.md": "infra\n",
      "tools/README.md": "tools\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    try {
      NodeFS.writeFileSync(NodePath.join(root, ".env"), "MAIN=1\n");
      NodeFS.writeFileSync(NodePath.join(root, "infra", ".env.local"), "INFRA=1\n");
      NodeFS.writeFileSync(NodePath.join(root, "local.txt"), "LOCAL=1\n");
      NodeFS.writeFileSync(NodePath.join(root, "tools", ".env"), "TOOLS=1\n");
      const outside = NodePath.join(dir, "outside");
      NodeFS.mkdirSync(outside);
      NodeFS.rmSync(NodePath.join(worktree, "tools"), { recursive: true });
      NodeFS.symlinkSync(outside, NodePath.join(worktree, "tools"));
      NodeFS.mkdirSync(NodePath.join(root, "node_modules"));
      NodeFS.writeFileSync(NodePath.join(root, "node_modules", ".env"), "DEP=1\n");
      NodeFS.writeFileSync(NodePath.join(worktree, ".env"), "MINE=1\n");
      const bin = NodePath.join(dir, "bin");
      NodeFS.mkdirSync(bin);
      NodeFS.writeFileSync(NodePath.join(bin, "pnpm"), '#!/bin/sh\necho "$@" > "$PNPM_LOG"\n', {
        mode: 0o755,
      });
      const log = NodePath.join(dir, "pnpm.log");

      const result = runSetup(root, worktree, {
        PATH: `${bin}${NodePath.delimiter}${process.env.PATH}`,
        PNPM_LOG: log,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(NodeFS.readFileSync(log, "utf8")).toBe("install --frozen-lockfile\n");
      expect(NodeFS.readFileSync(NodePath.join(worktree, ".env"), "utf8")).toBe("MINE=1\n");
      expect(NodeFS.readlinkSync(NodePath.join(worktree, "infra", ".env.local"))).toBe(
        NodePath.join(root, "infra", ".env.local"),
      );
      expect(NodeFS.existsSync(NodePath.join(worktree, "node_modules"))).toBe(false);
      expect(NodeFS.existsSync(NodePath.join(worktree, "local.txt"))).toBe(false);
      expect(NodeFS.readdirSync(outside)).toEqual([]);

      // The engine's forced removal: delete the folder, then drop Git's metadata.
      NodeFS.rmSync(worktree, { recursive: true });
      git(root, "worktree", "remove", "--force", "--force", "--", worktree);

      expect(NodeFS.existsSync(worktree)).toBe(false);
      expect(NodeFS.readFileSync(NodePath.join(root, ".env"), "utf8")).toBe("MAIN=1\n");
      expect(NodeFS.readFileSync(NodePath.join(root, "infra", ".env.local"), "utf8")).toBe(
        "INFRA=1\n",
      );
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Given no lockfile and no .env files, when setup runs, then it exits cleanly and changes nothing", () => {
    const { dir, root, worktree } = repo({ "README.md": "hi\n" });
    try {
      const before = git(root, "status", "--porcelain", "--ignored");

      const result = runSetup(root, worktree);

      expect(result.status, result.stderr).toBe(0);
      expect(git(worktree, "status", "--porcelain", "--ignored")).toBe("");
      expect(git(root, "status", "--porcelain", "--ignored")).toBe(before);
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});
