import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { migrateLegacyEvidence } from "./legacyEvidence";
import { createLinuxHost, type ProcessRunner } from "./wslEngine";

const runner: ProcessRunner = {
  run: async (_command, _args, options) => {
    const result = NodeChildProcess.spawnSync("sh", ["-s"], {
      input: options.stdin ?? "",
      encoding: "utf8",
    });
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  },
  start: () => {
    throw new Error("unused");
  },
};
const host = createLinuxHost({ platform: "linux", distro: null, runner });

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

type Tree = Readonly<Record<string, string | Buffer>>;

function plant(root: string, files: Tree) {
  for (const [path, contents] of Object.entries(files)) {
    NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, path)), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, path), contents);
  }
}

function read(root: string): Record<string, string> {
  if (!NodeFS.existsSync(root)) return {};
  const files = NodeFS.readdirSync(root, { recursive: true, encoding: "utf8" });
  return Object.fromEntries(
    files
      .filter((path) => NodeFS.statSync(NodePath.join(root, path)).isFile())
      .toSorted()
      .map((path) => [path, NodeFS.readFileSync(NodePath.join(root, path)).toString("hex")]),
  );
}

const hex = (tree: Tree) =>
  Object.fromEntries(
    Object.entries(tree).map(([path, text]) => [path, Buffer.from(text).toString("hex")]),
  );

describe("migrateLegacyEvidence", () => {
  it.each<[string, Tree, Tree, ReadonlyArray<string>, Tree]>([
    [
      "a new key is copied whole, binary included",
      { ".omp/artifacts/T-1/smoke.png": PNG, ".omp/artifacts/T-1/proof.txt": "ok\n" },
      {},
      ["migrated"],
      { "T-1/proof.txt": "ok\n", "T-1/smoke.png": PNG },
    ],
    [
      "a key already on the board keeps its files and gains only the missing ones",
      { ".omp/artifacts/T-1/README.txt": "worktree\n", ".omp/artifacts/T-1/extra.txt": "new\n" },
      { "T-1/README.txt": "board\n" },
      ["migrated"],
      { "T-1/README.txt": "board\n", "T-1/extra.txt": "new\n" },
    ],
    ["an empty worktree has nothing to migrate", { "src/app.ts": "" }, {}, ["nothing"], {}],
    [
      "a loose file with no ticket folder fails and copies nothing",
      { ".omp/artifacts/notes.md": "x\n" },
      {},
      ["failed", "notes.md is not in a ticket folder"],
      {},
    ],
  ])(
    "Given %s, when it migrates twice, then the board matches",
    async (_name, worktree, board, [status, reason], expected) => {
      const temp = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-legacy-"));
      try {
        const tree = NodePath.join(temp, "wt");
        const artifacts = NodePath.join(temp, "board", "artifacts");
        plant(tree, worktree);
        plant(artifacts, board);

        const first = await migrateLegacyEvidence(host, artifacts, [tree]);
        const second = await migrateLegacyEvidence(host, artifacts, [tree]);

        expect(first).toBe(`${[status, tree, ...(reason ? [reason] : [])].join("\t")}\n`);
        expect(second).toBe(first);
        expect(read(artifacts)).toEqual(hex(expected));
        expect(read(tree)).toEqual(hex(worktree));
      } finally {
        NodeFS.rmSync(temp, { recursive: true, force: true });
      }
    },
  );
});
