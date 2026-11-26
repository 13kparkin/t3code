import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

const Line = (max: number) => Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(max));

/** What the `call-notes` agent writes to `artifacts/calls/<callId>/notes.json`. */
export const CallNotes = Schema.Struct({
  callId: Line(64),
  asOf: Line(64),
  summary: Line(500),
  decisions: Schema.Array(Line(160)).check(Schema.isMaxLength(12)),
  actions: Schema.Array(
    Schema.Struct({ text: Line(160), who: Schema.Literals(["me", "them"]) }),
  ).check(Schema.isMaxLength(12)),
  // Each attached note keeps an additions.json item, and that file holds 12 for the whole board.
  ticketNotes: Schema.Array(Schema.Struct({ ticket: Line(40), text: Line(500) })).check(
    Schema.isMaxLength(4),
  ),
  newWork: Schema.Array(Schema.Struct({ title: Line(80), why: Line(300) })).check(
    Schema.isMaxLength(6),
  ),
});
export type CallNotes = typeof CallNotes.Type;

const decode = Schema.decodeUnknownResult(Schema.fromJsonString(CallNotes));
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

export const parseCallNotes = (text: string): Result.Result<CallNotes, string> =>
  Result.mapError(
    decode(text, { errors: "all" }),
    (error) =>
      `notes.json is invalid: ${formatIssues(error.issue)
        .issues.map((issue) => `${issue.path?.join(".") || "(file)"} ${issue.message}`)
        .join("; ")}`,
  );

/** Relative to the board folder. */
export const callNotesPath = (callId: string) => `artifacts/calls/${callId}/notes.json`;

/** How the app's message to the orchestrator starts, which the brief names. */
export const CALL_NOTES_MESSAGE = "Call notes:";

export const callNotesMessage = (input: {
  readonly callId: string;
  readonly title: string;
  readonly transcript: string;
  readonly notes: string;
}) =>
  [
    `${CALL_NOTES_MESSAGE} call \`${input.callId}\`, ${input.title}.`,
    `Transcript: \`${input.transcript}\``,
    `Notes: \`${input.notes}\``,
  ].join("\n");

export const callNotesForYouId = (callId: string, ticket: string) =>
  `call-${callId.slice(0, 8)}-${ticket}`.toLowerCase();

const WHO = { me: "Me", them: "Them" } as const;

const section = (heading: string, lines: ReadonlyArray<string>) =>
  lines.length === 0 ? [] : [`## ${heading}`, "", ...lines.map((line) => `- ${line}`), ""];

export const callNotesMarkdown = (title: string, notes: CallNotes): string =>
  [
    `# ${title} call notes`,
    "",
    notes.summary,
    "",
    ...section("Decisions", notes.decisions),
    ...section(
      "Actions",
      notes.actions.map((action) => `${WHO[action.who]}: ${action.text}`),
    ),
    ...section(
      "Ticket notes",
      notes.ticketNotes.map((note) => `${note.ticket}: ${note.text}`),
    ),
    ...section(
      "New work",
      notes.newWork.map((work) => `${work.title}: ${work.why}`),
    ),
  ].join("\n");
