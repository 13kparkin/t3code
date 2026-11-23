import { describe, expect, it } from "vite-plus/test";

import { type GlanceInput, glanceLines } from "./glance";
import type { Ticket } from "./ticket";

const ticketOf = (fields: Partial<Ticket> = {}): Ticket => ({
  key: "T-9",
  title: "A ticket",
  stage: "pr",
  ...fields,
});

const DECISIONS = [
  "time\tdecision\talternatives\treason\tevidence",
  "2026-11-20T10:00:00Z\tSplit T-93 into two tickets\t\t\t",
  "2026-11-21T10:00:00Z\tAdd T-9 for the slow lane\t\t\t",
  "2026-11-22T10:00:00Z\tMove T-9 to building\t\t\t",
].join("\n");

const inputOf = (fields: Partial<GlanceInput>): GlanceInput => ({
  ticket: ticketOf(),
  tickets: [],
  size: null,
  smoke: null,
  decisions: null,
  ...fields,
});

const lines = (fields: Partial<GlanceInput>) =>
  Object.fromEntries(glanceLines(inputOf(fields)).map(({ label, text }) => [label, text]));

describe("ticket at a glance", () => {
  it("Given a ticket with nothing yet, when its lines are derived, then there are none", () => {
    expect(glanceLines(inputOf({ ticket: ticketOf({ cause: " ", flags: [] }) }))).toEqual([]);
  });

  it.each([
    [
      "a root cause",
      { ticket: ticketOf({ cause: "The poll ran twice" }) },
      "Root cause",
      "The poll ran twice",
    ],
    [
      "who notices",
      { ticket: ticketOf({ impact: "Operators on slow links" }) },
      "Who notices",
      "Operators on slow links",
    ],
    ["a size", { size: { files: 1, additions: 40, deletions: 2 } }, "Size", "1 file, +40 −2 lines"],
    [
      "a size with no file count",
      { size: { files: null, additions: 40, deletions: 2 } },
      "Size",
      "+40 −2 lines",
    ],
    ["decisions", { decisions: DECISIONS }, "Came from", "Add T-9 for the slow lane"],
    [
      "a clean verify verdict and its step note",
      {
        ticket: ticketOf({
          verdicts: [
            { role: "verify", p1: 1 },
            { role: "verify", p0: 0, p1: 0 },
          ],
          steps: [{ text: "Verify on the matching surface", state: "done", note: "5 of 5 items" }],
        }),
      },
      "How we know",
      "Verify found nothing · 5 of 5 items",
    ],
    [
      "a verify verdict with findings",
      { ticket: ticketOf({ verdicts: [{ role: "verify", p1: 1, p3: 2 }] }) },
      "How we know",
      "Verify found 1 P1, 2 P3",
    ],
    [
      "review lanes and fix rounds",
      {
        ticket: ticketOf({
          fixRounds: 2,
          verdicts: [
            { role: "ponytail-review", p1: 1 },
            { role: "receipts", p0: 0 },
            { role: "ponytail-review", p2: 1 },
            { role: "verify", p0: 0 },
          ],
        }),
      },
      "Reviews",
      "2 lanes, 1 clean, ponytail-review 1 P2 · 2 fix rounds",
    ],
    ["fix rounds alone", { ticket: ticketOf({ fixRounds: 1 }) }, "Reviews", "1 fix round"],
    [
      "smoke items it could not fully check",
      { smoke: { kind: "read", surface: "T3 browser", flagged: ["PARTIAL 2 b", "NOT RUN 4 d"] } },
      "Not checked",
      "PARTIAL 2 b; NOT RUN 4 d",
    ],
    [
      "parents, one not on the board",
      {
        ticket: ticketOf({ dependsOn: ["T-1", "T-404"] }),
        tickets: [ticketOf({ key: "T-1", stage: "merged" })],
      },
      "Waiting on",
      "T-1 (Merged), T-404",
    ],
    [
      "tickets that wait on it",
      {
        tickets: [
          ticketOf({ key: "T-10", stage: "todo", dependsOn: ["T-9"] }),
          ticketOf({ key: "T-11", dependsOn: ["T-90"] }),
        ],
      },
      "Blocks",
      "T-10 (To do)",
    ],
    ["flags", { ticket: ticketOf({ flags: ["bug", "ui"] }) }, "Flags", "bug, ui"],
  ] as const)(
    "Given %s, when its lines are derived, then %s reads %j",
    (_name, fields, label, text) => {
      expect(lines(fields)[label]).toBe(text);
    },
  );

  it("Given a merged ticket with every field, when its lines are derived, then they run in the registry's order", () => {
    const labels = glanceLines(
      inputOf({
        ticket: ticketOf({
          cause: "c",
          impact: "i",
          dependsOn: ["T-1"],
          flags: ["bug"],
          fixRounds: 1,
          verdicts: [{ role: "verify" }],
        }),
        tickets: [ticketOf({ key: "T-2", dependsOn: ["T-9"] })],
        size: { files: 2, additions: 1, deletions: 1 },
        smoke: { kind: "read", surface: "x", flagged: ["NOT RUN y"] },
        decisions: DECISIONS,
      }),
    ).map((line) => line.label);
    expect(labels).toEqual([
      "Root cause",
      "Who notices",
      "Size",
      "Came from",
      "How we know",
      "Reviews",
      "Not checked",
      "Waiting on",
      "Blocks",
      "Flags",
    ]);
  });
});
