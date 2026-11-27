import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { ListedBoard } from "@agent-board/app/domain/board";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useAtomValue } from "@effect/atom-react";
import { useIsFocused } from "@react-navigation/native";
import { AppState } from "react-native";

import { boardProjectsAtom, engineFiles, engineStatusAtom } from "../connection/engine";
import { boardKey, createBoardStore, listBoards, type ProjectFiles } from "./boardAtoms";

export const connectedEnvironmentAtom = Atom.make((get) => {
  const status = get(engineStatusAtom);
  return status.kind === "connected" ? status.environmentId : null;
}).pipe(Atom.withLabel("phone-connected-environment"));

const engineFilesAtom = Atom.make((get): ProjectFiles | null => {
  const environmentId = get(connectedEnvironmentAtom);
  return environmentId === null ? null : engineFiles(get.registry, environmentId);
}).pipe(Atom.withLabel("phone-engine-files"));

const appActiveAtom = Atom.make((get) => {
  const subscription = AppState.addEventListener("change", (state) =>
    get.setSelf(state === "active"),
  );
  get.addFinalizer(() => subscription.remove());
  return AppState.currentState === "active";
}).pipe(Atom.withLabel("phone-app-active"));

const boardStore = createBoardStore(engineFilesAtom, appActiveAtom);
export const boardFilesAtom = boardStore.files;

const NOT_POLLING = Atom.make<void>(undefined).pipe(Atom.withLabel("phone-board-poll:none"));

/** The board's last read files. Bottom tabs keep a visited screen mounted, so only the focused one polls. */
export function useBoardFiles(key: string) {
  useAtomValue(useIsFocused() ? boardStore.poll(key) : NOT_POLLING);
  return useAtomValue(boardFilesAtom(key));
}

export interface BoardChoice {
  readonly key: string;
  readonly project: EnvironmentProject;
  readonly listed: ListedBoard;
}

export interface BoardList {
  readonly boards: ReadonlyArray<BoardChoice>;
  readonly problems: ReadonlyArray<string>;
}

export const boardListAtom = Atom.make((get): BoardList | Error | null => {
  const projects = get(boardProjectsAtom);
  const files = get(engineFilesAtom);
  if (projects === null || projects instanceof Error) return projects;
  if (files !== null) {
    let current = true;
    get.addFinalizer(() => {
      current = false;
    });
    void (async () => {
      const boards: Array<BoardChoice> = [];
      const problems: Array<string> = [];
      for (const { project, error } of projects) {
        if (error !== null) {
          problems.push(`${project.title}: ${error}`);
          continue;
        }
        try {
          for (const listed of await listBoards(files, project.workspaceRoot)) {
            boards.push({ key: boardKey(project.workspaceRoot, listed.folder), project, listed });
          }
        } catch (cause) {
          problems.push(`${project.title}: ${cause instanceof Error ? cause.message : cause}`);
        }
      }
      if (current) get.setSelf({ boards, problems });
    })();
  }
  return Option.getOrNull(get.self<BoardList | Error | null>());
}).pipe(Atom.withLabel("phone-board-list"));

export const pickedBoardAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("phone-picked-board"),
);

export const shownBoardAtom = Atom.make((get): BoardChoice | null => {
  const list = get(boardListAtom);
  if (list === null || list instanceof Error) return null;
  const picked = get(pickedBoardAtom);
  return list.boards.find((choice) => choice.key === picked) ?? list.boards[0] ?? null;
}).pipe(Atom.withLabel("phone-shown-board"));
