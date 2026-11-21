import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

export const TICKET_STAGES = [
  "todo",
  "planned",
  "building",
  "reviewing",
  "verifying",
  "pr",
  "awaiting_approval",
  "merged",
  "off_path",
] as const;
export type TicketStage = (typeof TICKET_STAGES)[number];

export const STAGE_LABEL = {
  todo: "To do",
  planned: "Planned",
  building: "Building",
  reviewing: "Reviewing",
  verifying: "Verifying",
  pr: "PR and CI",
  awaiting_approval: "Awaiting approval",
  merged: "Merged",
  off_path: "Off path",
} as const satisfies Record<TicketStage, string>;

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

// The orchestrator writes this file by hand, and a field it does not know yet is left out.
const optional = Schema.optionalKey;

const TicketThread = Schema.Struct({
  threadId: Schema.String,
  role: Schema.String,
  round: optional(Count),
});

const Verdict = Schema.Struct({
  role: Schema.String,
  p0: optional(Count),
  p1: optional(Count),
  p2: optional(Count),
  p3: optional(Count),
});

const TicketIssue = Schema.Struct({
  tracker: Schema.String.check(Schema.isNonEmpty()),
  /** The key people read: `XEO-3330` on Linear, `owner/repo#12` or `#12` on GitHub. */
  key: Schema.String.check(Schema.isNonEmpty()),
});
export type TicketIssue = typeof TicketIssue.Type;

const TicketStep = Schema.Struct({
  text: Schema.String,
  state: Schema.Literals(["done", "pending", "skipped"]),
  /** Why a step was skipped. */
  note: optional(Schema.String),
});
export type TicketStep = typeof TicketStep.Type;

export const Ticket = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.String,
  stage: Schema.Literals(TICKET_STAGES),
  track: optional(Schema.String),
  dependsOn: optional(Schema.Array(Schema.String)),
  flags: optional(Schema.Array(Schema.String)),
  branch: optional(Schema.String),
  base: optional(Schema.String),
  worktreePath: optional(Schema.String),
  /** The pull request's number or its link. */
  pr: optional(Schema.Union([Count, Schema.String])),
  headSha: optional(Schema.String),
  summary: optional(Schema.String),
  why: optional(Schema.String),
  threads: optional(Schema.Array(TicketThread)),
  verdicts: optional(Schema.Array(Verdict)),
  fixRounds: optional(Count),
  /** The tracker issue this ticket works, which its frame shows. */
  issue: optional(TicketIssue),
  /** The poteto-mode playbook's file name, such as `feature.md`. */
  playbook: optional(Schema.String),
  steps: optional(Schema.Array(TicketStep)),
});
export type Ticket = typeof Ticket.Type;

const UNPLANNED_STAGES: ReadonlySet<TicketStage> = new Set(["todo", "off_path"]);

/** A ticket past `todo` should carry its playbook and the steps copied from it. */
export const missingPlan = (ticket: Ticket): boolean =>
  !UNPLANNED_STAGES.has(ticket.stage) &&
  (ticket.playbook == null || (ticket.steps ?? []).length === 0);

export function stepProgress(ticket: Ticket) {
  const steps = ticket.steps ?? [];
  if (steps.length === 0) return null;
  const count = (state: TicketStep["state"]) => steps.filter((step) => step.state === state).length;
  return { done: count("done"), skipped: count("skipped"), total: steps.length };
}

export interface TicketsIssue {
  /** The ticket fields the decoder rejected, in file order. */
  readonly fields: ReadonlyArray<string>;
  readonly message: string;
}

const decodeTicketsJson = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Array(Ticket)));
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** Decodes the text of a `tickets.json`, naming the fields that are missing or wrong. */
export function parseTickets(text: string): Result.Result<ReadonlyArray<Ticket>, TicketsIssue> {
  const decoded = Result.mapError(
    decodeTicketsJson(text, { errors: "all" }),
    (error): TicketsIssue => {
      const issues = formatIssues(error.issue).issues;
      const fields = [
        ...new Set(
          issues.flatMap((issue) => {
            // The path is the ticket's index, then its field.
            const field = issue.path?.[1];
            return field === undefined ? [] : [String(field)];
          }),
        ),
      ];
      return {
        fields,
        message: `tickets.json is invalid: ${issues.map((issue) => `${issue.path?.join(".") || "(file)"} ${issue.message}`).join("; ")}`,
      };
    },
  );
  if (Result.isFailure(decoded)) return decoded;
  const seen = new Set<string>();
  for (const ticket of decoded.success) {
    if (seen.has(ticket.key)) {
      return Result.fail({
        fields: ["key"],
        message: `tickets.json is invalid: key ${ticket.key} is used by two tickets`,
      });
    }
    seen.add(ticket.key);
  }
  return decoded;
}
