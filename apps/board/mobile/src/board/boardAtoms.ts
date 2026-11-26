import {
  BOARD_FILE,
  BOARDS_DIR,
  type ListedBoard,
  parseBoard,
} from "@agent-board/app/domain/board";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Atom } from "effect/reactivity";

export const STORE_POLL_MS = 3_000;

export interface ProjectFiles {
  /** Entries under a project-relative directory, or null when it does not exist. */
  readonly list: (
    cwd: string,
    directory: string,
  ) => Promise<ReadonlyArray<{ readonly path: string; readonly kind: string }> | null>;
  /** The file's text, or null when it does not exist. */
  readonly read: (cwd: string, path: string) => Promise<string | null>;
}

export interface StoreFiles {
  readonly tickets: string | null;
  readonly forYou: string | null;
  readonly decisions: string | null;
  readonly additions: string | null;
}

export const boardKey = (cwd: string, folder: string) => `${cwd}/${BOARDS_DIR}/${folder}`;

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
  return listed.toSorted((a, b) => a.folder.localeCompare(b.folder));
}

const sameFiles = (left: StoreFiles | null, right: StoreFiles) =>
  left !== null &&
  left.tickets === right.tickets &&
  left.forYou === right.forYou &&
  left.decisions === right.decisions &&
  left.additions === right.additions;

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
        const dir = key.slice(split + 1);
        const read = (name: string) => files.read(cwd, `${dir}/${name}`);
        let current = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // The next round waits for this one, so a slow link never stacks reads.
        const refresh = () =>
          Promise.all([
            read("tickets.json"),
            read("foryou.jsonl"),
            read("decisions.tsv"),
            read("additions.json"),
          ])
            .then(
              ([tickets, forYou, decisions, additions]) => {
                const next = { tickets, forYou, decisions, additions };
                if (current && !sameFiles(Option.getOrNull(get.self<StoreFiles | null>()), next)) {
                  get.setSelf(next);
                }
              },
              () => undefined,
            )
            .then(() => {
              if (current) timer = setTimeout(refresh, STORE_POLL_MS);
            });
        void refresh();
        get.addFinalizer(() => {
          current = false;
          clearTimeout(timer);
        });
      }
      return Option.getOrNull(get.self<StoreFiles | null>());
    }).pipe(Atom.withLabel(`phone-board-store:${key}`)),
  );
}
