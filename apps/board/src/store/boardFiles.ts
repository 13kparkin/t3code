import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  type Board,
  BOARD_FILE,
  BOARDS_DIR,
  type BoardIssue,
  DEFAULT_BUILDER_CAP,
  parseBoard,
  serializeBoard,
  uniqueSlug,
} from "../domain/board";
import { ROLES, roleFiles } from "../orchestrator/roles";

/**
 * The engine's project file calls. Every path is relative to the project, because
 * `projects.listEntries` rejects an absolute `directoryPath` and `projects.writeFile` only writes
 * inside the project.
 */
export interface ProjectFiles {
  /** Entries under a project-relative directory, or null when it does not exist. */
  readonly list: (
    cwd: string,
    directory: string,
  ) => Promise<ReadonlyArray<{ readonly path: string; readonly kind: string }> | null>;
  /** The file's text, or null when it does not exist. */
  readonly read: (cwd: string, path: string) => Promise<string | null>;
  readonly write: (cwd: string, path: string, contents: string) => Promise<void>;
}

export type ListedBoard =
  | { readonly ok: true; readonly folder: string; readonly board: Board }
  | { readonly ok: false; readonly folder: string; readonly issue: BoardIssue };

export type ValidBoard = Extract<ListedBoard, { readonly ok: true }>;

const IGNORE_FILE = `${BOARDS_DIR}/.gitignore`;
const boardPath = (folder: string) => `${BOARDS_DIR}/${folder}/${BOARD_FILE}`;
const STORE_FILES = {
  "tickets.json": "[]",
  "foryou.jsonl": "",
  "decisions.tsv": "",
  "preferences.md": "",
  "gates.md": "",
  "smoke.md": "",
};
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

async function listFolders(files: ProjectFiles, cwd: string) {
  const entries = (await files.list(cwd, BOARDS_DIR)) ?? [];
  return {
    folders: entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => baseName(entry.path)),
    hasIgnoreFile: entries.some((entry) => entry.path === IGNORE_FILE),
  };
}

async function seedStoreFiles(files: ProjectFiles, cwd: string, folder: string) {
  for (const [name, contents] of Object.entries(STORE_FILES)) {
    const path = `${BOARDS_DIR}/${folder}/${name}`;
    if ((await files.read(cwd, path)) === null) await files.write(cwd, path, contents);
  }
}

const ROLES_MANIFEST = "roles/.app-written.json";
const decodeManifest = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

export const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const refreshing = new Map<string, Promise<void>>();

/**
 * Writes the app's role files into the board, replacing a copy only when it still matches the
 * hash the app recorded when it last wrote it. A copy the user edited, or one with no record, is
 * kept. A second call for the same board joins the running one, because the engine fails a read
 * that races a write creating the same file.
 */
export function refreshRoles(files: ProjectFiles, cwd: string, folder: string): Promise<void> {
  const key = `${cwd}/${BOARDS_DIR}/${folder}`;
  const running =
    refreshing.get(key) ?? writeRoles(files, cwd, folder).finally(() => refreshing.delete(key));
  refreshing.set(key, running);
  return running;
}

async function writeRoles(files: ProjectFiles, cwd: string, folder: string) {
  const dir = `${BOARDS_DIR}/${folder}`;
  const raw = await files.read(cwd, `${dir}/${ROLES_MANIFEST}`);
  const written = raw === null ? {} : Option.getOrElse(decodeManifest(raw), () => ({}));
  const next = { ...written };
  for (const role of ROLES) {
    const text = roleFiles.get(role.file);
    if (text === undefined) throw new Error(`The role file ${role.file} is missing from the app.`);
    const path = `${dir}/roles/${role.file}`;
    const current = await files.read(cwd, path);
    const appHash = await sha256(text);
    if (current !== text) {
      if (current !== null && (await sha256(current)) !== written[role.file]) {
        continue;
      }
      await files.write(cwd, path, text);
    }
    next[role.file] = appHash;
  }
  if (JSON.stringify(next) !== JSON.stringify(written)) {
    await files.write(cwd, `${dir}/${ROLES_MANIFEST}`, JSON.stringify(next, null, 2));
  }
}

/** Boards read at once, which keeps a project with many boards from flooding the socket. */
const READ_BATCH = 8;

/** Every `.agentboard/<slug>/board.json` in the project. A broken one is listed with its issue. */
export async function listBoards(
  files: ProjectFiles,
  cwd: string,
  refresh: boolean,
): Promise<ReadonlyArray<ListedBoard>> {
  const { folders } = await listFolders(files, cwd);
  const readOne = async (folder: string): Promise<ListedBoard | null> => {
    const text = await files.read(cwd, boardPath(folder));
    if (text === null) return null;
    const parsed = parseBoard(text);
    if (Result.isFailure(parsed)) return { ok: false, folder, issue: parsed.failure };
    if (refresh) {
      await seedStoreFiles(files, cwd, folder).catch(() => undefined);
      await refreshRoles(files, cwd, folder).catch(() => undefined);
    }
    return { ok: true, folder, board: parsed.success };
  };
  const listed: Array<ListedBoard | null> = [];
  for (let start = 0; start < folders.length; start += READ_BATCH) {
    listed.push(...(await Promise.all(folders.slice(start, start + READ_BATCH).map(readOne))));
  }
  return listed
    .filter((board) => board !== null)
    .toSorted((a, b) => a.folder.localeCompare(b.folder));
}

export interface NewBoard {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: string;
}

/** Writes `.agentboard/<slug>/board.json` and the store files, and the `.gitignore` that keeps git out of the whole folder. */
export async function createBoard(
  files: ProjectFiles,
  cwd: string,
  input: NewBoard,
): Promise<ValidBoard> {
  const { folders, hasIgnoreFile } = await listFolders(files, cwd);
  const slug = uniqueSlug(input.name, folders);
  const board: Board = {
    ...input,
    slug,
    orchestratorThreadId: null,
    archived: false,
    builderCap: DEFAULT_BUILDER_CAP,
  };
  if (!hasIgnoreFile) await files.write(cwd, IGNORE_FILE, "*\n");
  await files.write(cwd, boardPath(slug), serializeBoard(board));
  await seedStoreFiles(files, cwd, slug);
  return { ok: true, folder: slug, board };
}

export function writeBoard(files: ProjectFiles, cwd: string, folder: string, board: Board) {
  return files.write(cwd, boardPath(folder), serializeBoard(board));
}

async function readBoard(files: ProjectFiles, cwd: string, folder: string) {
  const text = await files.read(cwd, boardPath(folder));
  if (text === null) throw new Error(`${boardPath(folder)} is missing.`);
  const parsed = parseBoard(text);
  if (Result.isFailure(parsed)) throw new Error(parsed.failure.message);
  return parsed.success;
}

/** Writes only the given fields (an undefined review template removes its key) into the board's own file, read fresh so a change made since the last listing is kept. */
export async function updateBoard(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  fields: Omit<Partial<Board>, "reviewTemplate"> & { reviewTemplate?: string | undefined },
): Promise<Board> {
  const { reviewTemplate, ...rest } = { ...(await readBoard(files, cwd, folder)), ...fields };
  const board = reviewTemplate === undefined ? rest : { ...rest, reviewTemplate };
  await writeBoard(files, cwd, folder, board);
  return board;
}

export const setBuilderCap = (files: ProjectFiles, cwd: string, folder: string, cap: number) =>
  updateBoard(files, cwd, folder, { builderCap: cap });

/** Adds the names to the board's docs in the board's own file, read fresh so two sends in a row both count. */
export async function appendDocs(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  names: ReadonlyArray<string>,
  sentAt: string,
): Promise<void> {
  const board = await readBoard(files, cwd, folder);
  const docs = board.docs ?? [];
  const added = names
    .filter((name, at) => !docs.some((doc) => doc.name === name) && names.indexOf(name) === at)
    .map((name) => ({ name, sentAt }));
  if (added.length === 0) return;
  await writeBoard(files, cwd, folder, { ...board, docs: [...docs, ...added] });
}
