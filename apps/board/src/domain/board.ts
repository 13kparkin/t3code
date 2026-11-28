import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

export const BOARDS_DIR = ".agentboard";
export const BOARD_FILE = "board.json";

/** Orchestrators run at most this many builders until a board says otherwise. */
export const DEFAULT_BUILDER_CAP = 2;

const Text = Schema.String.check(Schema.isNonEmpty());

const Doc = Schema.Struct({ name: Text, sentAt: Text });
export type Doc = typeof Doc.Type;

const RoleOverride = Schema.Struct({
  model: Text,
  /** Missing means the model's own default. */
  effort: Schema.optionalKey(Text),
});
export type RoleOverride = typeof RoleOverride.Type;

const FreeAgent = Schema.Struct({ threadId: Text, x: Schema.Finite, y: Schema.Finite });
export type FreeAgent = typeof FreeAgent.Type;

export const CallApp = Schema.Literals(["zoom", "teams", "chrome", "edge"]);
export type CallApp = typeof CallApp.Type;

const Instant = Text.check(
  Schema.makeFilter((text) => !Number.isNaN(Date.parse(text)), {
    message: "must be a date and time",
  }),
);

const CallEvent = Schema.Struct({
  id: Text,
  title: Text.check(Schema.isMaxLength(80)),
  /** ISO 8601 with an offset. */
  start: Instant,
  app: CallApp,
  /** When a take of the call first started on any PC, so a PC that holds no takes keeps the call while a take can exist. */
  recordedAt: Schema.optionalKey(Instant),
});
export type CallEvent = typeof CallEvent.Type;

export const CardState = Schema.Literals(["todo", "done", "archived"]);
export type CardState = typeof CardState.Type;

export const Board = Schema.Struct({
  id: Text,
  slug: Text,
  name: Text,
  projectId: Text,
  /** Null until the board's orchestrator starts. */
  orchestratorThreadId: Schema.NullOr(Text),
  createdAt: Text,
  archived: Schema.Boolean,
  builderCap: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  /** The name of the board's review template. No value means the system template. */
  reviewTemplate: Schema.optionalKey(Text),
  /** Docs from before `docs.json`. The card shows them until the orchestrator copies them there once, and the schema keeps them so an app write cannot drop them first. */
  docs: Schema.optionalKey(Schema.Array(Doc)),
  /** Nothing reads it; the schema keeps it so an app write cannot drop it. */
  hiddenAdditions: Schema.optionalKey(Schema.Array(Text)),
  /** The model and effort the user set for a role, by role name. Each overrides the registry's default. Only the app writes this. */
  roleTargets: Schema.optionalKey(Schema.Record(Text, RoleOverride)),
  /** Each resolved `role_target` item's result, `Applied: ...` or `Rejected: ...`, by item id. Only the app writes this. */
  roleRequests: Schema.optionalKey(Schema.Record(Text, Text)),
  /** Agents the user started from the canvas, outside the orchestrator, at their place on it. Only the app writes this. */
  freeAgents: Schema.optionalKey(Schema.Array(FreeAgent)),
  /** Cards the user moved to To do or Done, or archived, by ticket key, thread id, or call id. Only the app writes this. */
  cardStates: Schema.optionalKey(Schema.Record(Text, CardState)),
  /** Call events the user entered by hand. Their Done and Archive states live in `cardStates` by call id. Only the app writes this. */
  calls: Schema.optionalKey(Schema.Array(CallEvent)),
});
export type Board = typeof Board.Type;

export interface BoardIssue {
  /** The `board.json` fields the decoder rejected, in file order. */
  readonly fields: ReadonlyArray<string>;
  readonly message: string;
}

/** A folder under `.agentboard` with its parsed `board.json`, or why it did not parse. */
export type ListedBoard =
  | { readonly ok: true; readonly folder: string; readonly board: Board }
  | { readonly ok: false; readonly folder: string; readonly issue: BoardIssue };

/** The desktop hides a board that is archived, or whose project is. A board that did not parse still shows. */
export const isArchivedBoard = (
  project: { readonly archivedAt?: string | null | undefined },
  listed: ListedBoard,
): boolean => project.archivedAt != null || (listed.ok && listed.board.archived);

const decodeBoardJson = Schema.decodeUnknownResult(Schema.fromJsonString(Board));
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** Decodes the text of a `board.json`, naming the fields that are missing or wrong. */
export function parseBoard(text: string): Result.Result<Board, BoardIssue> {
  return Result.mapError(decodeBoardJson(text, { errors: "all" }), (error): BoardIssue => {
    const issues = formatIssues(error.issue).issues;
    const fields = [
      ...new Set(issues.flatMap((issue) => (issue.path?.length ? [String(issue.path[0])] : []))),
    ];
    return {
      fields,
      message:
        fields.length > 0
          ? `board.json is invalid: ${issues.map((issue) => `${issue.path?.join(".") || "(file)"} ${issue.message}`).join("; ")}`
          : `board.json is not valid JSON or not a board: ${issues.map((issue) => issue.message).join("; ")}`,
    };
  });
}

const decodeDocsJson = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Array(Doc)));

/** Decodes the orchestrator's `docs.json`, the files the user sent it as the board's docs. */
export function parseDocs(
  text: string,
): Result.Result<ReadonlyArray<Doc>, { readonly message: string }> {
  return Result.mapError(decodeDocsJson(text, { errors: "all" }), (error) => ({
    message: `docs.json is invalid: ${formatIssues(error.issue)
      .issues.map((issue) => `${issue.path?.join(".") || "(file)"} ${issue.message}`)
      .join("; ")}`,
  }));
}

export function serializeBoard(board: Board): string {
  return `${JSON.stringify(board, null, 2)}\n`;
}

/** `Claude connector` becomes `claude-connector`; a name with no letters or digits becomes `board`. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "board" : slug;
}

/** The slug for a new board's folder: `claude-connector`, then `claude-connector-2` once it is taken. */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
