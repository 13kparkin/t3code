import { MERGE_CONDITIONS, type ForYouItem } from "./forYou";
import { type PrLive, sameCommit } from "./readiness";
import { TICKET_STAGES, type Ticket, type TicketStage } from "./ticket";

export type FindingId =
  | "no-merge-card"
  | "head-drift"
  | "no-verify-verdict"
  | "unmet-card-condition"
  | "stale-record"
  | "no-head-sha";

export interface Finding {
  readonly id: FindingId;
  readonly text: string;
}

export type MergeApproval = Extract<ForYouItem, { kind: "merge_approval" }>;

export interface FindingsCtx {
  /** This ticket's file-origin merge approvals, oldest first. */
  readonly cards: ReadonlyArray<MergeApproval>;
  /** The PR's state from the host. Null skips the live rule. */
  readonly live: PrLive | null;
}

const reached = (ticket: Ticket, stage: TicketStage) =>
  ticket.stage !== "off_path" &&
  TICKET_STAGES.indexOf(ticket.stage) >= TICKET_STAGES.indexOf(stage);

const WITH_HEAD: ReadonlySet<TicketStage> = new Set([
  "reviewing",
  "verifying",
  "pr",
  "awaiting_approval",
]);

const short = (sha: string) => sha.slice(0, 7);

// A live rule never owns a frame's only chip: `hasChips` already shows one whenever `headSha` is set.
const RULES: ReadonlyArray<{
  readonly id: FindingId;
  /** Null when the rule does not fire. */
  readonly text: (ticket: Ticket, ctx: FindingsCtx) => string | null;
}> = [
  {
    id: "no-merge-card",
    // Assumes foryou.jsonl keeps resolved cards, which it does today.
    text: (t, { cards }) =>
      t.stage === "merged" && t.pr != null && cards.length === 0
        ? "Merged with no merge-approval card"
        : null,
  },
  {
    id: "head-drift",
    text: (t, { live }) =>
      WITH_HEAD.has(t.stage) &&
      t.headSha != null &&
      live?.headSha != null &&
      live.state === "open" &&
      !sameCommit(t.headSha, live.headSha)
        ? `Ticket head ${short(t.headSha)} is not the PR head ${short(live.headSha)}`
        : null,
  },
  {
    id: "no-verify-verdict",
    text: (t) =>
      t.pr != null &&
      reached(t, "pr") &&
      !(t.verdicts ?? []).some((verdict) => verdict.role === "verify")
        ? "Left verifying with no verify verdict"
        : null,
  },
  {
    id: "unmet-card-condition",
    text: (t, { cards }) => {
      const latest = cards.at(-1);
      if (t.stage !== "merged" || t.pr == null || latest === undefined) return null;
      const unmet = MERGE_CONDITIONS.filter(({ key }) => latest.conditions[key].met === false).map(
        ({ key }) => key,
      );
      return unmet.length > 0 ? `Merged with ${unmet.join(", ")} unmet on its card` : null;
    },
  },
  {
    id: "stale-record",
    text: (t) => {
      if (t.stage !== "merged") return null;
      if ((t.steps ?? []).some((step) => step.state === "pending")) {
        return "Merged with a pending step";
      }
      return (t.flags ?? []).includes("queued") ? "Merged with a queued flag" : null;
    },
  },
  {
    id: "no-head-sha",
    text: (t) => (WITH_HEAD.has(t.stage) && t.headSha == null ? "No head recorded" : null),
  },
];

export function findingsFor(ticket: Ticket, ctx: FindingsCtx): ReadonlyArray<Finding> {
  return RULES.flatMap((rule) => {
    const text = rule.text(ticket, ctx);
    return text === null ? [] : [{ id: rule.id, text }];
  });
}

/** Whether a ticket has a finding the board's files alone show, which gives its frame a chip row. */
export const hasStoreFinding = (ticket: Ticket, cards: ReadonlyArray<MergeApproval>): boolean =>
  findingsFor(ticket, { cards, live: null }).length > 0;
