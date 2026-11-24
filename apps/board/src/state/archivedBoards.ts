import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Atom } from "effect/reactivity";

import type { ValidBoard } from "../store/boardFiles";
import { projectBoardsAtom } from "./boards";
import { environmentProjects } from "./projects";

export interface ArchivedBoard {
  readonly project: EnvironmentProject;
  readonly listed: ValidBoard;
}

/** Every archived board across the projects the sidebar lists. */
export const archivedBoardsAtom = Atom.make((get): ReadonlyArray<ArchivedBoard> =>
  get(environmentProjects.projectsAtom)
    .filter((project) => project.archivedAt == null)
    .flatMap((project) => {
      const boards = get(projectBoardsAtom(project.id));
      if (boards.status !== "ready") return [];
      return boards.boards.flatMap((listed) =>
        listed.ok && listed.board.archived ? [{ project, listed }] : [],
      );
    }),
).pipe(Atom.withLabel("archived-boards"));

export const archivedOpenAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("archived-open"),
);
