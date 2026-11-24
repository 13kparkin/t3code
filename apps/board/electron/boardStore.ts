import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export type MoveInput = {
  readonly direction: "to-store" | "to-project";
  readonly projectRoot: string;
  readonly key: string;
  readonly slug: string;
};

const BOARDS_DIR = ".agentboard";
const BOARD_FILE = "board.json";
const MOVED_FILE = "board.json.moved";
const NAME = /^(?!\.\.?$)[\w.-]+$/;

const files = async (directory: string): Promise<string[]> =>
  (
    await Promise.all(
      (await NodeFS.promises.readdir(directory, { withFileTypes: true })).map(async (entry) => {
        const path = NodePath.join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();

const digest = async (path: string) =>
  NodeCrypto.createHash("sha256")
    .update(await NodeFS.promises.readFile(path))
    .digest("hex");

const verified = async (from: string, to: string) => {
  for (const path of await files(from)) {
    const copy = NodePath.join(to, NodePath.relative(from, path));
    if (!NodeFS.existsSync(copy) || (await digest(copy)) !== (await digest(path))) return false;
  }
  return true;
};

/**
 * The board's global folder, one file tree under `root`. `list`, `read` and `write` take paths
 * relative to it and refuse any that leave it. `move` also touches the caller's project folder.
 */
export function createBoardStore(root: string) {
  const resolve = (path: string) => {
    const full = NodePath.resolve(root, path);
    if (full !== root && !full.startsWith(`${root}${NodePath.sep}`)) {
      throw new Error("The path leaves the board store.");
    }
    return full;
  };
  return {
    list: (path: string) => {
      try {
        return NodeFS.readdirSync(resolve(path), { withFileTypes: true }).map((entry) => ({
          path: `${path}/${entry.name}`,
          kind: entry.isDirectory() ? "directory" : "file",
        }));
      } catch {
        return null;
      }
    },
    read: (path: string): string | null => {
      const full = resolve(path);
      return NodeFS.existsSync(full) ? NodeFS.readFileSync(full, "utf8") : null;
    },
    write: (path: string, contents: string): void => {
      const full = resolve(path);
      NodeFS.mkdirSync(NodePath.dirname(full), { recursive: true });
      // Renamed into place, so a crash mid-write never leaves half a file.
      NodeFS.writeFileSync(`${full}.tmp`, contents);
      NodeFS.renameSync(`${full}.tmp`, full);
    },
    /**
     * Copies a board between the project and the store, checks every file by hash, then renames the
     * source's `board.json` to `board.json.moved` so only the copy lists. Running it again is a no-op.
     * The copy overwrites same-named files at the target.
     */
    move: async (
      input: MoveInput,
      hooks: { afterCopy?: (target: string) => void } = {},
    ): Promise<void> => {
      if (!NAME.test(input.key) || !NAME.test(input.slug)) throw new Error("Not a board name.");
      if (!NodePath.isAbsolute(input.projectRoot))
        throw new Error("The project root is not absolute.");
      const project = NodePath.join(input.projectRoot, BOARDS_DIR, input.slug);
      const stored = resolve(NodePath.join(input.key, input.slug));
      const [from, to] = input.direction === "to-store" ? [project, stored] : [stored, project];
      if (!NodeFS.existsSync(NodePath.join(from, BOARD_FILE))) {
        if (NodeFS.existsSync(NodePath.join(from, MOVED_FILE))) return;
        throw new Error("There is no board to move.");
      }
      await NodeFS.promises.mkdir(to, { recursive: true });
      await NodeFS.promises.cp(from, to, { recursive: true, force: true });
      hooks.afterCopy?.(to);
      if (!(await verified(from, to)))
        throw new Error("The copy did not verify, so nothing moved.");
      await NodeFS.promises.rm(NodePath.join(to, MOVED_FILE), { force: true });
      await NodeFS.promises.rename(
        NodePath.join(from, BOARD_FILE),
        NodePath.join(from, MOVED_FILE),
      );
    },
  };
}
