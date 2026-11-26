import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import {
  type AtomCommandResult,
  createEnvironmentRpcCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, ProjectListEntriesError, WS_METHODS } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Atom, type AtomRegistry } from "effect/reactivity";
import { AppState } from "react-native";

import { boardProjectsAtom, engineStatusAtom } from "../connection/engine";
import { connectionAtomRuntime } from "../connection/runtime";
import {
  boardKey,
  createBoardStore,
  type ListedBoard,
  listBoards,
  type ProjectFiles,
} from "./boardAtoms";

const listEntries = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "phone:board:list-entries",
  tag: WS_METHODS.projectsListEntries,
});
const readFile = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "phone:board:read-file",
  tag: WS_METHODS.projectsReadFile,
});
const isProjectListEntriesError = Schema.is(ProjectListEntriesError);

type FailedCommand = Extract<AtomCommandResult<unknown, unknown>, { readonly _tag: "Failure" }>;

const commandError = (result: FailedCommand) => {
  const failure = squashAtomCommandFailure(result);
  return failure instanceof Error ? failure : new Error(String(failure));
};

function engineFiles(registry: AtomRegistry.AtomRegistry, environmentId: EnvironmentId) {
  return {
    list: async (cwd, directoryPath) => {
      const result = await runAtomCommand(
        registry,
        listEntries,
        { environmentId, input: { cwd, directoryPath } },
        { reportFailure: false },
      );
      if (result._tag === "Success") return result.value.entries;
      const failure = squashAtomCommandFailure(result);
      if (isProjectListEntriesError(failure) && failure.failure === "directory_list_failed") {
        return null;
      }
      throw commandError(result);
    },
    read: async (cwd, relativePath) => {
      const result = await runAtomCommand(
        registry,
        readFile,
        { environmentId, input: { cwd, relativePath, allowMissing: true } },
        { reportFailure: false },
      );
      if (result._tag === "Failure") throw commandError(result);
      return result.value.exists === false ? null : result.value.contents;
    },
  } satisfies ProjectFiles;
}

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

export const boardStoreAtom = createBoardStore(engineFilesAtom, appActiveAtom);

export interface BoardChoice {
  readonly key: string;
  readonly project: EnvironmentProject;
  readonly listed: ListedBoard;
}

export interface BoardList {
  readonly boards: ReadonlyArray<BoardChoice>;
  /** A project whose boards could not be listed, with why. */
  readonly problems: ReadonlyArray<string>;
}

/** Every board in the projects that hold one, null until listed. */
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

/** The board the picker chose, by key. Null or a key no longer listed means the first board. */
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
