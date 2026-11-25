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

export const TicketIssue = Schema.Struct({
  tracker: Schema.String.check(Schema.isNonEmpty()),
  /** The key people read: `XEO-3330` on Linear, `owner/repo#12` or `#12` on GitHub. */
  key: Schema.String.check(Schema.isNonEmpty()),
});
export type TicketIssue = typeof TicketIssue.Type;

const TicketStep = Schema.Struct({
  text: Schema.String,
  state: Schema.Literals(["done", "pending", "skipped"]),
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
  /** For a bug, the root cause in one line, set at verify. */
  cause: optional(Schema.String),
  /** Who notices the change, in one line. */
  impact: optional(Schema.String),
  threads: optional(Schema.Array(TicketThread)),
  verdicts: optional(Schema.Array(Verdict)),
  fixRounds: optional(Count),
  description: optional(Schema.String),
  issue: optional(TicketIssue),
  /** The poteto-mode playbook's file name, such as `feature.md`. */
  playbook: optional(Schema.String),
  steps: optional(Schema.Array(TicketStep)),
});
export type Ticket = typeof Ticket.Type;

const UNPLANNED_STAGES: ReadonlySet<TicketStage> = new Set(["todo", "merged", "off_path"]);

/** Whether a ticket under way, past `todo` and not merged or off path, lacks its playbook or its steps. */
export const missingPlan = (ticket: Ticket): boolean =>
  !UNPLANNED_STAGES.has(ticket.stage) &&
  (ticket.playbook == null || (ticket.steps ?? []).length === 0);

const UNSTARTED_STAGES: ReadonlySet<TicketStage> = new Set([...UNPLANNED_STAGES, "planned"]);
const SOURCES = /^## Sources\s*$/m;

/**
 * Whether a ticket's research note lacks its `## Sources` section. A bug fix under way needs
 * `diagnosis.md`; any other ticket is checked only when it has a `design.md`. A note's text is
 * null when the file is missing and undefined until it is read.
 */
export function missingSources(
  ticket: Ticket,
  notes: {
    readonly design: string | null | undefined;
    readonly diagnosis: string | null | undefined;
  },
): boolean {
  if (ticket.playbook === "bug-fix.md") {
    if (UNSTARTED_STAGES.has(ticket.stage)) return false;
    return (
      notes.diagnosis === null || (notes.diagnosis !== undefined && !SOURCES.test(notes.diagnosis))
    );
  }
  return notes.design != null && !SOURCES.test(notes.design);
}

/** A note's text from the evidence listing and its read: undefined until both answer, null when it is missing or not text. */
export function noteText(
  listed: boolean,
  read:
    | { readonly status: "loading" | "failed" }
    | {
        readonly status: "done";
        readonly contents:
          | { readonly kind: "text"; readonly contents: string }
          | { readonly kind: "binary" | "missing" };
      }
    | null,
): string | null | undefined {
  if (!listed) return undefined;
  if (read === null) return null;
  if (read.status !== "done") return undefined;
  return read.contents.kind === "text" ? read.contents.contents : null;
}

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
