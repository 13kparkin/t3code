import {
  type EngineRequest,
  engineRequestsOf,
  type ForYouList,
  mergeForYou,
  openCards,
} from "@agent-board/app/domain/forYou";
import { Atom } from "effect/reactivity";

import { boardFilesAtom, boardListAtom, boardPollAtom, shownBoardAtom } from "../board/files";
import { engineStatusAtom, environmentSnapshot } from "../connection/engine";
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

/** The tab the phone opens on: For you when an item is open, else Running. Null until the shown board's files are read. */
export const startTabAtom = Atom.make((get): "For you" | "Running" | null => {
  const status = get(engineStatusAtom).kind;
  // A cold start passes through connecting; a PC that cannot be reached moves on to reconnecting or refused.
  if (status === "connecting") return null;
  if (status !== "connected") return "Running";
  const list = get(boardListAtom);
  if (list === null) return null;
  const shown = get(shownBoardAtom);
  if (list instanceof Error || shown === null || !shown.listed.ok) return "Running";
  get(boardPollAtom(shown.key));
  if (get(boardFilesAtom(shown.key)) === null) return null;
  return get(forYouOpenCountAtom) > 0 ? "For you" : "Running";
}).pipe(Atom.withLabel("phone-start-tab"));
