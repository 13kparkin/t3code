import {
  type EngineRequest,
  type ForYouAnswer,
  type ForYouCard,
  forYouMessage,
  type SentCard,
} from "@agent-board/app/domain/forYou";
import { type TrackerCall, trackerCall } from "@agent-board/app/issues/issueLinks";
import { Atom, type AtomRegistry } from "effect/reactivity";

/** It has no file write, so `foryou.jsonl` stays the orchestrator's. */
export interface ForYouEngine {
  /**
   * Sends a message to the board's orchestrator as the user. `text` runs only once the orchestrator
   * can take it, so nothing it does happens for a message that cannot go. Resolves to the failure
   * text, or null once sent.
   */
  readonly message: (text: () => Promise<string>) => Promise<string | null>;
  readonly respondApproval: (
    request: EngineRequest,
    decision: "accept" | "decline",
  ) => Promise<string | null>;
  /** Makes the tracker change and resolves to its outcome, or rejects with the failure. */
  readonly trackerCall: (call: TrackerCall) => Promise<string>;
}

export interface ForYouTarget {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly engine: ForYouEngine;
  readonly boardKey: string;
  readonly projectId: string;
}

type SentByBoard = Readonly<Record<string, ReadonlyMap<string, SentCard>>>;

/** The cards the user answered this session, by board key then card id. */
export const forYouSentAtom = Atom.make<SentByBoard>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("phone-foryou-sent"),
);

type FileCard = Extract<ForYouCard, { readonly origin: "file" }>;
type EngineCard = Extract<ForYouCard, { readonly origin: "engine" }>;

const CHOICE_LABEL = {
  approve: "Approved",
  hold: "Held",
  resume: "Resumed",
  read: "Marked read",
} as const;

const answerLabel = (answer: ForYouAnswer) =>
  answer.type === "choice" ? CHOICE_LABEL[answer.choice] : `Answered: ${answer.text}`;

const setSent = (target: ForYouTarget, card: ForYouCard, choice: string | null) => {
  const all = target.registry.get(forYouSentAtom);
  const board = new Map(all[target.boardKey]);
  if (choice === null) board.delete(card.id);
  else {
    board.set(card.id, {
      card,
      choice,
      status: card.origin === "file" ? card.item.status : "open",
    });
  }
  target.registry.set(forYouSentAtom, { ...all, [target.boardKey]: board });
};

/**
 * Messages the orchestrator, which records the answer in the file. Approving a `tracker_write` makes
 * its change first. If the message then fails, the card stays Sent and the failure names the change.
 */
export async function answerItem(
  target: ForYouTarget,
  card: FileCard,
  answer: ForYouAnswer,
): Promise<string | null> {
  const { item } = card;
  let result: string | undefined;
  let failure: string | null;
  try {
    failure = await target.engine.message(async () => {
      setSent(target, card, answerLabel(answer));
      if (
        item.kind === "tracker_write" &&
        answer.type === "choice" &&
        answer.choice === "approve"
      ) {
        result = await target.engine.trackerCall(trackerCall(item.write, target.projectId));
        return forYouMessage(card.id, { ...answer, result });
      }
      return forYouMessage(card.id, answer);
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  if (failure === null) return null;
  if (result === undefined) {
    setSent(target, card, null);
    return failure;
  }
  return `${failure} The tracker change was already made: ${result}`;
}

/** The card leaves once the engine drops the request. */
export async function answerApproval(
  target: ForYouTarget,
  card: EngineCard,
  decision: "accept" | "decline",
): Promise<string | null> {
  setSent(target, card, decision === "accept" ? "Approved" : "Declined");
  const failure = await target.engine.respondApproval(card.request, decision);
  if (failure !== null) setSent(target, card, null);
  return failure;
}
