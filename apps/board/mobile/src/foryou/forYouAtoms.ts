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
import { sentWritesAtom, settleWrites } from "./actions";

const NO_REQUESTS: ReadonlyArray<EngineRequest> = [];

const sameRequests = (left: ReadonlyArray<EngineRequest>, right: ReadonlyArray<EngineRequest>) =>
  left.length === right.length &&
  left.every(
    (request, index) =>
      request.id === right[index]?.id && request.threadTitle === right[index]?.threadTitle,
  );

/** Equal lists keep the old value, so a shell update does not re-parse the file. */
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
  const list = mergeForYou(text, get(shownRequestsAtom), shown.listed.board.roleRequests);
  const writes = get.once(sentWritesAtom);
  const kept = settleWrites(writes, shown.key, list.cards);
  if (kept !== writes) get.set(sentWritesAtom, kept);
  return list;
}).pipe(Atom.withLabel("phone-foryou-cards"));

/** The For you tab badge. */
export const forYouOpenCountAtom = Atom.make((get) => {
  const list = get(shownForYouAtom);
  return list === null ? 0 : openCards(list.cards).length;
}).pipe(Atom.withLabel("phone-foryou-open-count"));
