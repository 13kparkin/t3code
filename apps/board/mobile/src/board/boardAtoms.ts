import {
  BOARD_FILE,
  BOARDS_DIR,
  type Board,
  type BoardIssue,
  parseBoard,
} from "@agent-board/app/domain/board";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Atom } from "effect/reactivity";

export const STORE_POLL_MS = 3_000;

/** The phone's reads of a project's files. It has no write, so the phone never changes the board folder. */
export interface ProjectFiles {
  /** Entries under a project-relative directory, or null when it does not exist. */
  readonly list: (
    cwd: string,
    directory: string,
  ) => Promise<ReadonlyArray<{ readonly path: string; readonly kind: string }> | null>;
  /** The file's text, or null when it does not exist. */
  readonly read: (cwd: string, path: string) => Promise<string | null>;
}

const STORE_FILES = ["tickets.json", "foryou.jsonl", "decisions.tsv", "additions.json"] as const;

export interface StoreFiles {
  readonly tickets: string | null;
  readonly forYou: string | null;
  readonly decisions: string | null;
  readonly additions: string | null;
}

export type ListedBoard =
  | { readonly ok: true; readonly folder: string; readonly board: Board }
  | { readonly ok: false; readonly folder: string; readonly issue: BoardIssue };

/** A board's folder, `<workspaceRoot>/.agentboard/<folder>`, which keys its store. */
export const boardKey = (cwd: string, folder: string) => `${cwd}/${BOARDS_DIR}/${folder}`;

/** Every folder under the project's `.agentboard` that holds a `board.json`, parsed. */
export async function listBoards(
  files: ProjectFiles,
  cwd: string,
): Promise<ReadonlyArray<ListedBoard>> {
  const entries = (await files.list(cwd, BOARDS_DIR)) ?? [];
  const listed: Array<ListedBoard> = [];
  for (const { path, kind } of entries) {
    if (kind !== "directory") continue;
    const folder = path.slice(path.lastIndexOf("/") + 1);
    const text = await files.read(cwd, `${BOARDS_DIR}/${folder}/${BOARD_FILE}`);
    if (text === null) continue;
    const parsed = parseBoard(text);
    listed.push(
      Result.isSuccess(parsed)
        ? { ok: true, folder, board: parsed.success }
        : { ok: false, folder, issue: parsed.failure },
    );
  }
  return listed;
}

const sameFiles = (left: StoreFiles | null, right: StoreFiles) =>
  left !== null &&
  left.tickets === right.tickets &&
  left.forYou === right.forYou &&
  left.decisions === right.decisions &&
  left.additions === right.additions;

/**
 * The orchestrator's store files for one board, by `boardKey`. They are read every few seconds while
 * the files port is up and the app is active, and the last files stay up while it is not.
 */
export function createBoardStore(
  filesAtom: Atom.Atom<ProjectFiles | null>,
  activeAtom: Atom.Atom<boolean>,
) {
  return Atom.family((key: string) =>
    Atom.make<StoreFiles | null>((get) => {
      const files = get(filesAtom);
      if (files !== null && get(activeAtom)) {
        const split = key.lastIndexOf(`/${BOARDS_DIR}/`);
        const cwd = key.slice(0, split);
        const folder = key.slice(split + 1);
        let current = true;
        const refresh = () =>
          Promise.all(STORE_FILES.map((name) => files.read(cwd, `${folder}/${name}`))).then(
            ([tickets = null, forYou = null, decisions = null, additions = null]) => {
              const next = { tickets, forYou, decisions, additions };
              if (current && !sameFiles(Option.getOrNull(get.self<StoreFiles | null>()), next)) {
                get.setSelf(next);
              }
            },
            () => undefined,
          );
        void refresh();
        const timer = setInterval(() => void refresh(), STORE_POLL_MS);
        get.addFinalizer(() => {
          current = false;
          clearInterval(timer);
        });
      }
      return Option.getOrNull(get.self<StoreFiles | null>());
    }).pipe(Atom.withLabel(`phone-board-store:${key}`)),
  );
}
