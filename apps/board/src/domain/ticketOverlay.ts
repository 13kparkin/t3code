import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { type Ticket, TicketIssue } from "./ticket";

export const OVERLAY_FILE = "ticket-details.json";

const Edits = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  dependsOn: Schema.optionalKey(Schema.Array(Schema.String)),
  issue: Schema.optionalKey(Schema.NullOr(TicketIssue)),
});
export type Edits = typeof Edits.Type;

const Pulled = Schema.Struct({
  issue: TicketIssue,
  title: Schema.String,
  description: Schema.String,
  url: Schema.String,
  at: Schema.String,
});
export type Pulled = typeof Pulled.Type;

const Entry = Schema.Struct({
  edits: Schema.optionalKey(Edits),
  pulled: Schema.optionalKey(Pulled),
});

const OverlaySchema = Schema.Record(Schema.String, Entry);
export type Overlay = typeof OverlaySchema.Type;

export type LockedField = "title" | "description";

const LOCKED_FIELDS = new Map<string, ReadonlyArray<LockedField>>([
  ["linear", ["title", "description"]],
  ["github", ["title", "description"]],
  ["url", []],
]);

export const lockedFields = (ticket: Pick<Ticket, "issue">): ReadonlySet<LockedField> =>
  new Set(ticket.issue == null ? [] : (LOCKED_FIELDS.get(ticket.issue.tracker) ?? []));

const decode = Schema.decodeUnknownResult(Schema.fromJsonString(OverlaySchema));
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

export function parseOverlay(text: string): Result.Result<Overlay, { readonly message: string }> {
  return Result.mapError(decode(text, { errors: "all" }), (error) => ({
    message: `${OVERLAY_FILE} is invalid: ${formatIssues(error.issue)
      .issues.map((issue) => `${issue.path?.join(".") || "(file)"} ${issue.message}`)
      .join("; ")}`,
  }));
}

const sameIssue = (a: TicketIssue | null | undefined, b: TicketIssue | null | undefined) =>
  a?.tracker === b?.tracker && a?.key === b?.key;

export function applyOverlay(
  tickets: ReadonlyArray<Ticket>,
  overlay: Overlay,
): ReadonlyArray<Ticket> {
  if (Object.keys(overlay).length === 0) return tickets;
  return tickets.map((ticket) => {
    const entry = overlay[ticket.key];
    if (entry === undefined) return ticket;
    const { issue: editedIssue, ...edits } = entry.edits ?? {};
    const { issue: _dropped, ...rest } = ticket;
    const issue = editedIssue === undefined ? ticket.issue : (editedIssue ?? undefined);
    const edited: Ticket = { ...rest, ...edits, ...(issue === undefined ? {} : { issue }) };
    const { pulled } = entry;
    if (pulled === undefined || issue === undefined || !sameIssue(pulled.issue, issue))
      return edited;
    const held = lockedFields(edited);
    return {
      ...edited,
      ...(held.has("title") ? { title: pulled.title } : {}),
      ...(held.has("description") ? { description: pulled.description } : {}),
    };
  });
}

const prune = (overlay: Overlay, key: string, entry: Overlay[string]): Overlay => {
  const { [key]: _old, ...others } = overlay;
  const { edits, pulled } = entry;
  const keptEdits = edits !== undefined && Object.keys(edits).length > 0;
  if (!keptEdits && pulled === undefined) return others;
  return {
    ...others,
    [key]: { ...(keptEdits ? { edits } : {}), ...(pulled === undefined ? {} : { pulled }) },
  };
};

const decodeEdits = Schema.decodeUnknownSync(Edits);
const parseEdits = (entries: ReadonlyArray<readonly [string, unknown]>) =>
  decodeEdits(Object.fromEntries(entries));

export function editOverlay(overlay: Overlay, key: string, patch: Edits): Overlay {
  const entry = overlay[key] ?? {};
  const edits = parseEdits(Object.entries({ ...entry.edits, ...patch }));
  const relinked = "issue" in patch && !sameIssue(patch.issue, entry.edits?.issue);
  const { pulled, ...bare } = entry;
  return prune(overlay, key, {
    ...bare,
    edits,
    ...(pulled === undefined || relinked ? {} : { pulled }),
  });
}

const samePulled = (a: Pulled, b: Pulled) =>
  JSON.stringify({ ...a, at: "" }) === JSON.stringify({ ...b, at: "" });

export function pullOverlay(overlay: Overlay, key: string, pulled: Pulled): Overlay {
  const entry = overlay[key] ?? {};
  if (entry.pulled !== undefined && samePulled(entry.pulled, pulled)) return overlay;
  return prune(overlay, key, { ...entry, pulled });
}

export function unlinkOverlay(overlay: Overlay, key: string): Overlay {
  const entry = overlay[key] ?? {};
  const { pulled, ...bare } = entry;
  const copy = pulled === undefined ? {} : { title: pulled.title, description: pulled.description };
  return prune(overlay, key, { ...bare, edits: { ...entry.edits, ...copy, issue: null } });
}

export function wouldCycle(
  tickets: ReadonlyArray<Ticket>,
  key: string,
  next: ReadonlyArray<string>,
): ReadonlyArray<string> | null {
  const waits = new Map(tickets.map((ticket) => [ticket.key, ticket.dependsOn ?? []]));
  const visited = new Set<string>();
  const walk = (at: string): ReadonlyArray<string> | null => {
    if (at === key) return [key];
    if (visited.has(at)) return null;
    visited.add(at);
    for (const dep of waits.get(at) ?? []) {
      const path = walk(dep);
      if (path !== null) return [at, ...path];
    }
    return null;
  };
  for (const dep of next) {
    const path = walk(dep);
    if (path !== null) return [key, ...path];
  }
  return null;
}

export const waitingOn = (ticket: Ticket, tickets: ReadonlyArray<Ticket>): ReadonlyArray<string> =>
  (ticket.dependsOn ?? []).filter(
    (dep) => tickets.find((entry) => entry.key === dep)?.stage !== "merged",
  );
