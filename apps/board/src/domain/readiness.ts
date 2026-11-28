import { MERGE_CONDITIONS } from "./forYou";
import type { Ticket } from "./ticket";

export type ConditionKey = (typeof MERGE_CONDITIONS)[number]["key"];

/** The evidence files the gate reads, which the brief must name as written. */
export const CI_LOCAL_FILE = "ci-local.txt";
export const SMOKE_FILE = "smoke.txt";
export const README_CHECK = /readmes?[-_ ]?(check|pass|lint)/i;

/** A check that has run longer than this is flagged as stuck. */
export const STUCK_AFTER_MS = 20 * 60_000;

export type PrState = "open" | "closed" | "merged";
export type ChecksState = "passing" | "failing" | "pending";
export type Mergeability = "mergeable" | "conflicting" | "unknown";
export type CheckStatus =
  | "pending"
  | "action-required"
  | "success"
  | "failure"
  | "skipped"
  | "neutral"
  | "cancelled";

export interface CheckRun {
  readonly name: string;
  readonly status: CheckStatus;
  /** What the host says about the check, such as how long it took, or null. */
  readonly description: string | null;
  /** The check's page on the host, or null. */
  readonly url: string | null;
  /** Whether branch protection requires the check. */
  readonly required: boolean;
  /** Stands for checks the host could not list, so it is neither passing nor running. */
  readonly placeholder: boolean;
  /** When the board first saw the check running, or null when it is not running. The host gives no start time. */
  readonly runningSince: number | null;
}

/** What the host says about a pull request now. */
export interface PrLive {
  readonly state: PrState;
  readonly checksState: ChecksState | null;
  readonly mergeability: Mergeability;
  /** The commit the checks ran on, when the host or the engine's watch reports it. */
  readonly headSha: string | null;
  readonly checks: ReadonlyArray<CheckRun>;
  /** The pull request's page, which the chip opens. */
  readonly url: string | null;
  /** How much the pull request changes, or null when the host has not said. */
  readonly size: PrSize | null;
}

export interface PrSize {
  /** Null when the host gives line counts but no file count. */
  readonly files: number | null;
  readonly additions: number;
  readonly deletions: number;
}

/** One `<step>-exit=<code>` line of a local CI run, with the line's label, such as `engine-exit`. */
export interface CiExit {
  readonly label: string;
  readonly code: number;
}

/** A ticket's `ci-local.txt`, as the run it records or the reason the board cannot judge it. */
export type CiLocal =
  | { readonly kind: "run"; readonly headSha: string; readonly exits: ReadonlyArray<CiExit> }
  | { readonly kind: "unreadable"; readonly reason: string };

/** Reads a local CI run, which has the head SHA on line 1 and then each step's output ending in `<step>-exit=<code>`. */
export function parseCiLocal(text: string): CiLocal {
  const headSha = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!/^[0-9a-f]{7,40}$/.test(headSha)) {
    return { kind: "unreadable", reason: "ci-local.txt has no head SHA on line 1" };
  }
  const exits = [...text.matchAll(/^((?:\S+-)?exit)=(-?\d+)\s*$/gm)].map((match) => ({
    label: match[1] ?? "",
    code: Number(match[2]),
  }));
  return exits.length === 0
    ? { kind: "unreadable", reason: "ci-local.txt has no exit codes" }
    : { kind: "run", headSha, exits };
}

/** A ticket's `smoke.txt`, as the surface it names and the items it could only partly check, or the reason the board cannot judge it. */
export type Smoke =
  | {
      readonly kind: "read";
      /** The text after `Surface:`, or null when the file has no such line. */
      readonly surface: string | null;
      /** The `PARTIAL`, `PROXY` and `NOT RUN` item lines, as written. */
      readonly flagged: ReadonlyArray<string>;
    }
  | { readonly kind: "unreadable"; readonly reason: string };

/** Reads a verifier's `smoke.txt`, which has a `Surface:` line and then one `PASS`, `PARTIAL`, `PROXY`, `FAIL`, or `NOT RUN` line per acceptance item. */
export function parseSmoke(text: string): Smoke {
  const surface = /^Surface:(.*)$/im.exec(text)?.[1]?.trim() || null;
  const flagged = [...text.matchAll(/^(?:PARTIAL|PROXY|NOT RUN)\b.*\S.*$/gm)].map((match) =>
    match[0].trim(),
  );
  return { kind: "read", surface, flagged };
}

/** What keeps `smoke.txt` from meeting `smoke_named`, or null when it meets it. */
export function smokeState(smoke: Smoke | null): string | null {
  if (smoke === null) return "No smoke.txt in the evidence";
  if (smoke.kind === "unreadable") return smoke.reason;
  if (smoke.surface === null) return "smoke.txt has no Surface: line";
  return /^none\b/i.test(smoke.surface) ? "smoke.txt says Surface: none" : null;
}

export interface ConditionState {
  readonly key: ConditionKey;
  readonly label: string;
  readonly met: boolean;
  /** The evidence it reads has not been listed yet, so it is neither met nor missing. */
  readonly checking: boolean;
  /** What is missing, in a few words, or null when the condition holds or is checking. */
  readonly missing: string | null;
  /** Lines the card shows under the condition, such as the smoke items that were only proxied or not run. */
  readonly notes: ReadonlyArray<string>;
}

export interface ReadinessInput {
  readonly ticket: Ticket;
  /** Every ticket on the board, which says what the ticket's parents are doing. */
  readonly tickets: ReadonlyArray<Ticket>;
  /** The paths of the ticket's evidence files, relative to the board folder, or null until the listing loads. */
  readonly evidence: ReadonlyArray<string> | null;
  /** Null when the ticket has no pull request, or the host has not answered. */
  readonly live: PrLive | null;
  /** The ticket's `ci-local.txt`, which stands in for checks when the host reports none. Null when there is none, undefined until read. */
  readonly ciLocal: CiLocal | null | undefined;
  /** The ticket's `smoke.txt`. Null when there is none, undefined until read. */
  readonly smoke: Smoke | null | undefined;
  /** The orchestrator's note on the merge order, which only a parent that is ready and not yet merged needs. */
  readonly mergeOrderNote: string | null;
  /** The names of the roles that review, whose threads re-review a fix round. */
  readonly reviewRoles: ReadonlySet<string>;
  readonly now: number;
}

/** A check that has been running past the limit. */
export const isStuck = (check: CheckRun, now: number): boolean =>
  check.status === "pending" &&
  check.runningSince !== null &&
  now - check.runningSince > STUCK_AFTER_MS;

const isFailed = (check: CheckRun) => check.status === "failure" || check.status === "cancelled";
const isWaiting = (check: CheckRun) =>
  check.status === "pending" || check.status === "action-required";

/** The one state the checks add up to, as the host rolls them up. Null when there are none. */
export function rollupChecks(checks: ReadonlyArray<CheckRun>): ChecksState | null {
  const real = checks.filter((check) => !check.placeholder);
  if (real.length === 0) return null;
  if (real.some(isFailed)) return "failing";
  return real.some(isWaiting) ? "pending" : "passing";
}

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const sameCommit = (left: string, right: string) =>
  left.startsWith(right) || right.startsWith(left);

/** What keeps a local CI run from meeting `ci_green` on `head`, or null when it meets it. */
export function localCiState(ciLocal: CiLocal | null, head: string | null): string | null {
  if (ciLocal === null) return "No checks reported and no ci-local.txt";
  if (ciLocal.kind === "unreadable") return ciLocal.reason;
  if (head === null) return "The pull request's head is unknown";
  if (!sameCommit(ciLocal.headSha, head)) {
    return `ci-local.txt ran on ${ciLocal.headSha.slice(0, 7)}, not ${head.slice(0, 7)}`;
  }
  const failed = ciLocal.exits.filter((exit) => exit.code !== 0);
  return failed.length === 0
    ? null
    : `ci-local.txt has ${failed.map((exit) => `${exit.label}=${exit.code}`).join(", ")}`;
}

/** What is missing, null when met, or undefined while the evidence it reads is still listing. */
type Verdict = string | null | undefined;

function ciState(input: ReadinessInput): Verdict {
  const { ticket, live, now } = input;
  if (ticket.pr == null) return "No pull request yet";
  if (live === null) return "CI has not answered";
  if (live.state === "closed") return "The pull request is closed";
  const real = live.checks.filter((check) => !check.placeholder);
  const stuck = real.filter((check) => isStuck(check, now));
  if (stuck.length > 0) return `${stuck.map((check) => check.name).join(", ")} stuck`;
  const failed = real.filter(isFailed);
  if (failed.length > 0) return `${failed.map((check) => check.name).join(", ")} failing`;
  const waiting = real.filter(isWaiting);
  if (waiting.length > 0) return `${plural(waiting.length, "check")} still running`;
  if (live.checks.length > real.length) return "Some checks could not be listed";
  if (real.length === 0) {
    if (live.checksState !== null) return "Checks are loading";
    return input.evidence === null || input.ciLocal === undefined
      ? undefined
      : localCiState(input.ciLocal, live.headSha ?? ticket.headSha ?? null);
  }
  if (
    ticket.headSha != null &&
    live.headSha !== null &&
    !sameCommit(ticket.headSha, live.headSha)
  ) {
    return `Checks ran on ${live.headSha.slice(0, 7)}, not ${ticket.headSha.slice(0, 7)}`;
  }
  return null;
}

/** The latest verdict of each role, so a clean re-review replaces the findings it covers. */
export function latestVerdicts(verdicts: NonNullable<Ticket["verdicts"]>) {
  const byRole = new Map<string, (typeof verdicts)[number]>();
  for (const verdict of verdicts) byRole.set(verdict.role, verdict);
  return [...byRole.values()];
}

function reviewsState(ticket: Ticket): string | null {
  const latest = latestVerdicts(ticket.verdicts ?? []);
  if (latest.length === 0) return "No reviews yet";
  const open = latest.filter((verdict) => (verdict.p0 ?? 0) + (verdict.p1 ?? 0) > 0);
  return open.length === 0
    ? null
    : `Unresolved P0 or P1 from ${open.map((verdict) => verdict.role).join(", ")}`;
}

function deltaState(ticket: Ticket, reviewRoles: ReadonlySet<string>): string | null {
  const rounds = ticket.fixRounds ?? 0;
  if (rounds === 0) return null;
  const reviewed = (ticket.threads ?? []).some(
    (thread) => reviewRoles.has(thread.role) && (thread.round ?? 0) >= rounds,
  );
  return reviewed ? null : `Fix round ${rounds} has no review after it`;
}

const evidenceState = (evidence: ReadonlyArray<string> | null, pattern: RegExp, none: string) =>
  evidence === null ? undefined : evidence.some((path) => pattern.test(path)) ? null : none;

function parentState(input: ReadinessInput): string | null {
  const { ticket, tickets, mergeOrderNote } = input;
  const open = (ticket.dependsOn ?? []).filter(
    (key) => tickets.find((entry) => entry.key === key)?.stage !== "merged",
  );
  if (open.length === 0) return null;
  const notReady = open.filter(
    (key) => tickets.find((entry) => entry.key === key)?.stage !== "awaiting_approval",
  );
  if (notReady.length > 0) return `${notReady.join(", ")} not merged or ready`;
  return mergeOrderNote === null || mergeOrderNote.trim() === "" ? "No merge-order note" : null;
}

/** The six merge-ready conditions, in a card's order, each with what is missing. */
export function evaluateReadiness(input: ReadinessInput): ReadonlyArray<ConditionState> {
  const missing = {
    ci_green: ciState(input),
    reviews_fixed: reviewsState(input.ticket),
    delta_rereviewed: deltaState(input.ticket, input.reviewRoles),
    readmes_pass: evidenceState(input.evidence, README_CHECK, "No README check in the evidence"),
    parent_ready: parentState(input),
    smoke_named:
      input.evidence === null || input.smoke === undefined ? undefined : smokeState(input.smoke),
  } satisfies Record<ConditionKey, Verdict>;
  const smokeNotes = input.smoke?.kind === "read" ? input.smoke.flagged : [];
  return MERGE_CONDITIONS.map(({ key, label }) => ({
    key,
    label,
    met: missing[key] === null,
    checking: missing[key] === undefined,
    missing: missing[key] ?? null,
    notes: key === "smoke_named" ? smokeNotes : [],
  }));
}

/** The keys of the conditions that do not hold, in a card's order. */
export const missingKeys = (
  conditions: ReadonlyArray<ConditionState>,
): ReadonlyArray<ConditionKey> =>
  conditions.filter((condition) => !condition.met).map((condition) => condition.key);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the key stands alone in the text, so `T-9` does not match `T-93`. */
export const namesKey = (text: string, key: string) =>
  new RegExp(`(^|[^\\w-])${escapeRegExp(key)}($|[^\\w-])`).test(text);

/**
 * The ticket a merge approval is about: the one it names, or else the one whose key stands alone
 * in its title or id, where a longer key wins over one it contains.
 */
export function mergeTicketKey(
  item: { readonly ticket?: string | null; readonly id: string; readonly title: string },
  keys: ReadonlyArray<string>,
): string | null {
  if (item.ticket != null && keys.includes(item.ticket)) return item.ticket;
  const found = keys
    .toSorted((a, b) => b.length - a.length)
    .find((key) => [item.title, item.id].some((text) => namesKey(text, key)));
  return found ?? null;
}
