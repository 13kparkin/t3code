import { latestVerdicts, namesKey, plural, type PrSize, type Smoke } from "./readiness";
import { STAGE_LABEL, type Ticket } from "./ticket";

export interface GlanceInput {
  readonly ticket: Ticket;
  /** Every ticket on the board, which says what the ticket waits on and what waits on it. */
  readonly tickets: ReadonlyArray<Ticket>;
  readonly size: PrSize | null;
  readonly smoke: Smoke | null;
  /** The text of the board's `decisions.tsv`. */
  readonly decisions: string | null;
}

interface GlanceLine {
  readonly label: string;
  /** The line's text, or null when the ticket has nothing for it, which leaves the line out. */
  readonly derive: (input: GlanceInput) => string | null;
}

type Verdict = NonNullable<Ticket["verdicts"]>[number];

const text = (value: string | undefined) => value?.trim() || null;

const findings = (verdict: Verdict) =>
  (["p0", "p1", "p2", "p3"] as const)
    .filter((level) => (verdict[level] ?? 0) > 0)
    .map((level) => `${verdict[level]} ${level.toUpperCase()}`)
    .join(", ");

function origin(decisions: string | null, key: string): string | null {
  const rows = (decisions ?? "").split("\n").slice(1);
  return text(rows.map((row) => row.split("\t")[1] ?? "").find((cell) => namesKey(cell, key)));
}

const keysWithStage = (keys: ReadonlyArray<string>, tickets: ReadonlyArray<Ticket>) =>
  keys.length === 0
    ? null
    : keys
        .map((key) => {
          const stage = tickets.find((ticket) => ticket.key === key)?.stage;
          return stage === undefined ? key : `${key} (${STAGE_LABEL[stage]})`;
        })
        .join(", ");

function howWeKnow(ticket: Ticket): string | null {
  const verdict = latestVerdicts(ticket.verdicts ?? []).find((entry) => entry.role === "verify");
  const outcome = verdict === undefined ? null : `Verify found ${findings(verdict) || "nothing"}`;
  const note = text(ticket.steps?.find((step) => /^verify\b/i.test(step.text))?.note);
  const parts = [outcome, note].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function reviews(ticket: Ticket): string | null {
  const lanes = latestVerdicts(ticket.verdicts ?? []).filter((entry) => entry.role !== "verify");
  const rounds = ticket.fixRounds ?? 0;
  const open = lanes.flatMap((lane) => {
    const found = findings(lane);
    return found === "" ? [] : [`${lane.role} ${found}`];
  });
  const parts = [
    lanes.length === 0
      ? null
      : [`${plural(lanes.length, "lane")}, ${lanes.length - open.length} clean`, ...open].join(
          ", ",
        ),
    rounds === 0 ? null : plural(rounds, "fix round"),
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function size(value: PrSize | null): string | null {
  if (value === null) return null;
  const lines = `+${value.additions} −${value.deletions} lines`;
  return value.files === null ? lines : `${plural(value.files, "file")}, ${lines}`;
}

/** Top to bottom. Summary and Why have sections of their own. */
export const GLANCE_LINES: ReadonlyArray<GlanceLine> = [
  { label: "Root cause", derive: ({ ticket }) => text(ticket.cause) },
  { label: "Who notices", derive: ({ ticket }) => text(ticket.impact) },
  { label: "Size", derive: (input) => size(input.size) },
  { label: "Came from", derive: ({ decisions, ticket }) => origin(decisions, ticket.key) },
  { label: "How we know", derive: ({ ticket }) => howWeKnow(ticket) },
  { label: "Reviews", derive: ({ ticket }) => reviews(ticket) },
  {
    label: "Not checked",
    derive: ({ smoke }) =>
      smoke?.kind === "read" && smoke.flagged.length > 0 ? smoke.flagged.join("; ") : null,
  },
  {
    label: "Waiting on",
    derive: ({ ticket, tickets }) => keysWithStage(ticket.dependsOn ?? [], tickets),
  },
  {
    label: "Blocks",
    derive: ({ ticket, tickets }) =>
      keysWithStage(
        tickets
          .filter((entry) => entry.dependsOn?.includes(ticket.key) === true)
          .map((entry) => entry.key),
        tickets,
      ),
  },
  { label: "Flags", derive: ({ ticket }) => (ticket.flags ?? []).join(", ") || null },
];

export const glanceLines = (input: GlanceInput) =>
  GLANCE_LINES.flatMap(({ label, derive }) => {
    const line = derive(input);
    return line === null ? [] : [{ label, text: line }];
  });
