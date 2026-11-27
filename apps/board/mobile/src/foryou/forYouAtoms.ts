import {
  type EngineRequest,
  engineRequestsOf,
  type ForYouList,
  mergeForYou,
  openCards,
} from "@agent-board/app/domain/forYou";
import { Atom } from "effect/reactivity";

import { boardFilesAtom, shownBoardAtom } from "../board/files";
import { environmentSnapshot } from "../connection/engine";

const NO_REQUESTS: ReadonlyArray<EngineRequest> = [];

const sameRequests = (left: ReadonlyArray<EngineRequest>, right: ReadonlyArray<EngineRequest>) =>
  left.length === right.length &&
  left.every(
    (request, index) =>
      request.id === right[index]?.id && request.threadTitle === right[index]?.threadTitle,
  );

/** What the shown board's agents wait on. Equal lists keep the old value, so a shell update does not re-parse the file. */
const shownRequestsAtom = Atom.make((get): ReadonlyArray<EngineRequest> => {
  const shown = get(shownBoardAtom);
  const root = shown?.listed.ok ? shown.listed.board.orchestratorThreadId : null;
  if (shown === null || root === null) return NO_REQUESTS;
  const threads = get(environmentSnapshot(shown.project.environmentId))?.threads ?? [];
  return engineRequestsOf(
    threads.filter(
      (thread) =>
        thread.lineage.rootThreadId === root &&
        thread.archivedAt === null &&
        thread.deletedAt === null,
    ),
  );
}).pipe(Atom.withEquality(sameRequests), Atom.withLabel("phone-foryou-requests"));

export const shownForYouAtom = Atom.make((get): ForYouList | null => {
  const shown = get(shownBoardAtom);
  if (shown === null || !shown.listed.ok) return null;
  const text = get(boardFilesAtom(shown.key))?.forYou ?? null;
  return mergeForYou(text, get(shownRequestsAtom), shown.listed.board.roleRequests);
}).pipe(Atom.withLabel("phone-foryou-cards"));

/** The tab badge: cards waiting on the user on the shown board, from its last read and the live engine requests. */
export const forYouOpenCountAtom = Atom.make((get) => {
  const list = get(shownForYouAtom);
  return list === null ? 0 : openCards(list.cards).length;
}).pipe(Atom.withLabel("phone-foryou-open-count"));
