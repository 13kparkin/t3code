import type { BoardStoreHost } from "../connection/engineState";
import { BOARD_FILE, BOARDS_DIR } from "../domain/board";
import type { ProjectFiles } from "./boardFiles";

/** The project's folder under the store: its own name for a human, a hash of its path for uniqueness. */
export function projectKeyOf(cwd: string): string {
  let hash = 0x811c9dc5;
  for (const char of cwd) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  const name = cwd.split(/[\\/]/).findLast(Boolean) ?? "project";
  return `${name.replace(/[^\w.-]/g, "_")}-${hash.toString(16).padStart(8, "0")}`;
}

const PREFIX = `${BOARDS_DIR}/`;

/**
 * The project's files, with each board that moved to the global store answered from there. A board
 * lists from the store when its `board.json` is there, so a move only has to flip that file.
 */
export function routeFiles(project: ProjectFiles, store: BoardStoreHost): ProjectFiles {
  const stored = async (key: string, slug: string) =>
    (await store.read(`${key}/${slug}/${BOARD_FILE}`).catch(() => null)) !== null;
  const place = async (cwd: string, path: string) => {
    if (!path.startsWith(PREFIX)) return null;
    const [slug, ...rest] = path.slice(PREFIX.length).split("/");
    const key = projectKeyOf(cwd);
    return slug !== undefined && slug !== "" && (await stored(key, slug))
      ? { key, storePath: [key, slug, ...rest].join("/") }
      : null;
  };
  return {
    list: async (cwd, directory) => {
      const own = await project.list(cwd, directory);
      if (directory !== BOARDS_DIR) {
        const at = await place(cwd, `${directory}/`);
        if (at === null) return own;
        const entries = await store.list(at.storePath.replace(/\/$/, ""));
        return (
          entries?.map((entry) => ({
            ...entry,
            path: `${BOARDS_DIR}/${entry.path.slice(at.key.length + 1)}`,
          })) ?? null
        );
      }
      const key = projectKeyOf(cwd);
      const names = (await store.list(key).catch(() => null)) ?? [];
      const moved = [];
      for (const entry of names) {
        const slug = entry.path.slice(key.length + 1);
        if (entry.kind === "directory" && (await stored(key, slug))) {
          moved.push({ path: `${BOARDS_DIR}/${slug}`, kind: "directory" });
        }
      }
      const seen = new Set(moved.map((entry) => entry.path));
      return own === null && moved.length === 0
        ? null
        : [...moved, ...(own ?? []).filter((entry) => !seen.has(entry.path))];
    },
    read: async (cwd, path) => {
      const at = await place(cwd, path);
      return at === null ? project.read(cwd, path) : store.read(at.storePath);
    },
    write: async (cwd, path, contents) => {
      const at = await place(cwd, path);
      if (at === null) await project.write(cwd, path, contents);
      else await store.write(at.storePath, contents);
    },
  };
}

/** The absolute folder an agent reads and writes a board in: the store's when the board moved there, else the project's. */
export async function boardDirOf(
  store: BoardStoreHost | undefined,
  cwd: string,
  folder: string,
): Promise<string> {
  const key = projectKeyOf(cwd);
  const root = store === undefined ? null : await store.root().catch(() => null);
  const moved = (await store?.read(`${key}/${folder}/${BOARD_FILE}`).catch(() => null)) != null;
  return root !== null && moved ? `${root}/${key}/${folder}` : `${cwd}/${BOARDS_DIR}/${folder}`;
}
