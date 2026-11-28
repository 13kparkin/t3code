import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  type Board,
  BOARD_FILE,
  BOARDS_DIR,
  type ListedBoard,
  type CallEvent,
  type CardState,
  type FreeAgent,
  DEFAULT_BUILDER_CAP,
  parseBoard,
  type RoleOverride,
  serializeBoard,
  uniqueSlug,
  withCardState,
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

export type ValidBoard = Extract<ListedBoard, { readonly ok: true }>;

const IGNORE_FILE = `${BOARDS_DIR}/.gitignore`;
const boardPath = (folder: string) => `${BOARDS_DIR}/${folder}/${BOARD_FILE}`;
const STORE_FILES = {
  "tickets.json": "[]",
  "foryou.jsonl": "",
  "decisions.tsv": "",
  "additions.json": "[]",
  "ticket-details.json": "{}",
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

export async function readBoard(files: ProjectFiles, cwd: string, folder: string) {
  const text = await files.read(cwd, boardPath(folder));
  if (text === null) throw new Error(`${boardPath(folder)} is missing.`);
  const parsed = parseBoard(text);
  if (Result.isFailure(parsed)) throw new Error(parsed.failure.message);
  return parsed.success;
}

let changing: Promise<unknown> = Promise.resolve();

/** Applies `change` to the board read fresh from its own file and resolves to the saved board. Calls run one at a time, so two quick changes both count. */
function changeBoard(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  change: (board: Board) => Board,
): Promise<Board> {
  const run = changing.then(async () => {
    const board = change(await readBoard(files, cwd, folder));
    await writeBoard(files, cwd, folder, board);
    return board;
  });
  changing = run.catch(() => undefined);
  return run;
}

/** Writes only the given fields (an undefined review template removes its key) into the board's own file. */
export const updateBoard = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  fields: Omit<Partial<Board>, "reviewTemplate"> & { reviewTemplate?: string | undefined },
) =>
  changeBoard(files, cwd, folder, (current) => {
    const { reviewTemplate, ...rest } = { ...current, ...fields };
    return reviewTemplate === undefined ? rest : { ...rest, reviewTemplate };
  });

/** Sets one card's state; null puts it back on the canvas. */
export const changeCardState = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  key: string,
  state: CardState | null,
) => changeBoard(files, cwd, folder, (board) => withCardState(board, key, state));

/** Adds a free agent, or moves the one with the same thread. */
export const placeFreeAgent = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  agent: FreeAgent,
) =>
  changeBoard(files, cwd, folder, (board) => ({
    ...board,
    freeAgents: [
      ...(board.freeAgents ?? []).filter((entry) => entry.threadId !== agent.threadId),
      agent,
    ],
  }));

/** Adds a call event, or updates the one with the same id in its place, keeping its `recordedAt` mark. */
export const putCall = (files: ProjectFiles, cwd: string, folder: string, call: CallEvent) =>
  changeBoard(files, cwd, folder, (board) => {
    const calls = board.calls ?? [];
    return {
      ...board,
      calls: calls.some((entry) => entry.id === call.id)
        ? calls.map((entry) => (entry.id === call.id ? { ...entry, ...call } : entry))
        : [...calls, call],
    };
  });

/** Marks when a take of the call first started. A call already marked keeps its time. */
export const markCallRecorded = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  id: string,
  recordedAt: string,
) =>
  changeBoard(files, cwd, folder, (board) => ({
    ...board,
    calls: (board.calls ?? []).map((call) =>
      call.id === id && call.recordedAt === undefined ? { ...call, recordedAt } : call,
    ),
  }));

/**
 * Removes a call event and its card state. With `judged`, the call a cleanup found finished, it
 * removes only while the saved call still has that start and that mark, so an edit or a new take since keeps it.
 */
export const removeCall = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  id: string,
  judged?: Pick<CallEvent, "start" | "recordedAt">,
) =>
  changeBoard(files, cwd, folder, (board) => {
    const saved = (board.calls ?? []).find((call) => call.id === id);
    if (
      judged !== undefined &&
      (saved?.start !== judged.start || saved.recordedAt !== judged.recordedAt)
    ) {
      return board;
    }
    const { [id]: _removed, ...cardStates } = board.cardStates ?? {};
    return { ...board, calls: (board.calls ?? []).filter((call) => call.id !== id), cardStates };
  });

function withRoleTarget(board: Board, role: string, target: RoleOverride | null): Board {
  const { [role]: _replaced, ...others } = board.roleTargets ?? {};
  return { ...board, roleTargets: target === null ? others : { ...others, [role]: target } };
}

/** Sets one role's target; null removes it. */
export const changeRoleTarget = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  role: string,
  target: RoleOverride | null,
) => changeBoard(files, cwd, folder, (board) => withRoleTarget(board, role, target));

/** Records a `role_target` item's result, and its target when applied, in one write. An id already recorded changes nothing. */
export const resolveRoleRequest = (
  files: ProjectFiles,
  cwd: string,
  folder: string,
  id: string,
  resolution: string,
  applied: { readonly role: string; readonly target: RoleOverride | null } | null,
) =>
  changeBoard(files, cwd, folder, (board) =>
    board.roleRequests?.[id] !== undefined
      ? board
      : {
          ...(applied === null ? board : withRoleTarget(board, applied.role, applied.target)),
          roleRequests: { ...board.roleRequests, [id]: resolution },
        },
  );

export const setBuilderCap = (files: ProjectFiles, cwd: string, folder: string, cap: number) =>
  updateBoard(files, cwd, folder, { builderCap: cap });
