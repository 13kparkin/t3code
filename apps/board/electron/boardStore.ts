import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export type MoveInput = {
  readonly direction: "to-store" | "to-project";
  readonly projectRoot: string;
  /** The project's folder name under the store. */
  readonly key: string;
  readonly slug: string;
};

const BOARDS_DIR = ".agentboard";
const BOARD_FILE = "board.json";
const MOVED_FILE = "board.json.moved";
const NAME = /^(?!\.\.?$)[\w.-]+$/;

const files = (directory: string): string[] =>
  NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });

const digest = (path: string) =>
  NodeCrypto.createHash("sha256").update(NodeFS.readFileSync(path)).digest("hex");

/** Every file of `to` matches the one at the same place in `from`, by content. */
function verified(from: string, to: string): boolean {
  return files(from).every((path) => {
    const copy = NodePath.join(to, NodePath.relative(from, path));
    return NodeFS.existsSync(copy) && digest(copy) === digest(path);
  });
}

/**
 * The board's global folder, one file tree under `root`. Every path is relative to it and cannot
 * leave it, because the renderer is not trusted with the rest of the disk.
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
     * Copies a board between the project and the store, checks every file arrived with the same
     * content, then flips: the copy keeps its `board.json` and the source's becomes `board.json.moved`,
     * so only one side lists the board. Nothing is deleted. Running it again ends in the same state.
     */
    move: (input: MoveInput, hooks: { afterCopy?: (target: string) => void } = {}): void => {
      if (!NAME.test(input.key) || !NAME.test(input.slug)) throw new Error("Not a board name.");
      const project = NodePath.join(input.projectRoot, BOARDS_DIR, input.slug);
      const stored = resolve(NodePath.join(input.key, input.slug));
      const [from, to] = input.direction === "to-store" ? [project, stored] : [stored, project];
      if (!NodeFS.existsSync(NodePath.join(from, BOARD_FILE))) {
        if (NodeFS.existsSync(NodePath.join(from, MOVED_FILE))) return;
        throw new Error("There is no board to move.");
      }
      NodeFS.mkdirSync(to, { recursive: true });
      NodeFS.cpSync(from, to, { recursive: true, force: true });
      hooks.afterCopy?.(to);
      if (!verified(from, to)) throw new Error("The copy did not verify, so nothing moved.");
      NodeFS.rmSync(NodePath.join(to, MOVED_FILE), { force: true });
      NodeFS.renameSync(NodePath.join(from, BOARD_FILE), NodePath.join(from, MOVED_FILE));
    },
  };
}
