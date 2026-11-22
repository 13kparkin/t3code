import { describe, expect, it } from "vite-plus/test";

import {
  type CheckRun,
  type ConditionKey,
  evaluateReadiness,
  isStuck,
  missingKeys,
  mergeTicketKey,
  parseCiLocal,
  parseSmoke,
  type PrLive,
  type ReadinessInput,
  rollupChecks,
  type Smoke,
  smokeState,
} from "./readiness";
import type { Ticket } from "./ticket";

const REVIEW_ROLES: ReadonlySet<string> = new Set(["reviewer", "security-reviewer"]);
const NOW = Date.parse("2026-11-20T12:00:00Z");
const minutesAgo = (minutes: number) => NOW - minutes * 60_000;

const check = (name: string, status: CheckRun["status"], runningSince: number | null = null) => ({
  name,
  status,
  description: null,
  url: null,
  required: false,
  placeholder: false,
  runningSince,
});

const live = (checks: ReadonlyArray<CheckRun>, headSha: string | null = "abc1234"): PrLive => ({
  state: "open",
  checksState: rollupChecks(checks),
  mergeability: "mergeable",
  headSha,
  checks,
  url: "https://github.com/acme/app/pull/12",
});

const green = live([check("lint", "success"), check("test", "success")]);

const ticketOf = (fields: Partial<Ticket> & { key: string }): Ticket => ({
  title: "A ticket",
  stage: "pr",
  ...fields,
});

const clean = [
  { role: "reviewer", p0: 0, p1: 0, p2: 1, p3: 0 },
  { role: "security-reviewer", p0: 0, p1: 0, p2: 0, p3: 0 },
];
const evidence = ["artifacts/T-1/readme-check.txt"];
const smoked: Smoke = { kind: "read", surface: "T3 browser", flagged: [] };

const missingOf = (
  fields: Partial<ReadinessInput> & { ticket: Ticket },
): ReadonlyArray<ConditionKey> =>
  missingKeys(
    evaluateReadiness({
      tickets: [fields.ticket],
      evidence,
      live: green,
      ciLocal: null,
      smoke: smoked,
      mergeOrderNote: null,
      reviewRoles: REVIEW_ROLES,
      now: NOW,
      ...fields,
    }),
  );

describe("merge readiness", () => {
  it("Given a ticket with every condition true, when readiness is computed, then nothing is missing", () => {
    const ticket = ticketOf({
      key: "T-1",
      pr: 12,
      headSha: "abc1234",
      verdicts: clean,
      fixRounds: 1,
      threads: [{ threadId: "th-1", role: "reviewer", round: 1 }],
    });
    expect(missingOf({ ticket })).toEqual([]);
  });

  it("Given a verdict with an unresolved P1, when readiness is computed, then only the reviews condition is missing", () => {
    const ticket = ticketOf({
      key: "T-1",
      pr: 12,
      verdicts: [{ role: "reviewer", p1: 1 }, clean[1]!],
    });
    const conditions = evaluateReadiness({
      ticket,
      tickets: [ticket],
      evidence,
      live: green,
      ciLocal: null,
      smoke: smoked,
      mergeOrderNote: null,
      reviewRoles: REVIEW_ROLES,
      now: NOW,
    });
    expect(missingKeys(conditions)).toEqual(["reviews_fixed"]);
    expect(conditions[1]?.missing).toBe("Unresolved P0 or P1 from reviewer");
  });

  it("Given a role's clean re-review after its P1, when readiness is computed, then the reviews condition holds", () => {
    const ticket = ticketOf({
      key: "T-1",
      pr: 12,
      verdicts: [{ role: "reviewer", p1: 1 }, clean[1]!, { role: "reviewer", p1: 0 }],
    });
    expect(missingOf({ ticket })).toEqual([]);
  });

  it("Given a child of a parent still in a PR with a failing check and no README check, when readiness is computed, then CI, the README check, and the parent are missing", () => {
    const parent = ticketOf({ key: "T-0", stage: "pr" });
    const ticket = ticketOf({ key: "T-1", pr: 12, dependsOn: ["T-0"], verdicts: clean });
    expect(
      missingOf({
        ticket,
        tickets: [parent, ticket],
        evidence: [],
        live: live([check("lint", "success"), check("test", "failure")]),
      }),
    ).toEqual(["ci_green", "readmes_pass", "parent_ready"]);
  });

  it("Given a ticket with no pull request, no review, an unreviewed fix round, no evidence, and a ready parent with no merge-order note, when readiness is computed, then all six are missing", () => {
    const parent = ticketOf({ key: "T-0", stage: "awaiting_approval" });
    const ticket = ticketOf({
      key: "T-1",
      dependsOn: ["T-0"],
      verdicts: [],
      fixRounds: 2,
      threads: [{ threadId: "th-1", role: "reviewer", round: 1 }],
    });
    expect(
      missingOf({ ticket, tickets: [parent, ticket], evidence: [], live: null, smoke: null }),
    ).toEqual([
      "ci_green",
      "reviews_fixed",
      "delta_rereviewed",
      "readmes_pass",
      "parent_ready",
      "smoke_named",
    ]);
  });

  it("Given a ready parent and a merge-order note, when readiness is computed, then the parent condition holds", () => {
    const parent = ticketOf({ key: "T-0", stage: "awaiting_approval" });
    const ticket = ticketOf({ key: "T-1", pr: 12, dependsOn: ["T-0"], verdicts: clean });
    expect(
      missingOf({ ticket, tickets: [parent, ticket], mergeOrderNote: "Merge T-0 first" }),
    ).toEqual([]);
  });

  it("Given checks that ran on another commit than the ticket's head, when readiness is computed, then CI is missing", () => {
    const ticket = ticketOf({ key: "T-1", pr: 12, headSha: "def5678", verdicts: clean });
    expect(missingOf({ ticket })).toEqual(["ci_green"]);
  });
});

describe("stuck checks", () => {
  it("Given a check running 21 minutes, when it is tested, then it is stuck", () => {
    expect(isStuck(check("test", "pending", minutesAgo(21)), NOW)).toBe(true);
  });

  it("Given a check running 19 minutes, when it is tested, then it is not stuck", () => {
    expect(isStuck(check("test", "pending", minutesAgo(19)), NOW)).toBe(false);
  });

  it("Given a check running 21 minutes, when readiness is computed, then CI names it as stuck", () => {
    const ticket = ticketOf({ key: "T-1", pr: 12, verdicts: clean });
    const conditions = evaluateReadiness({
      ticket,
      tickets: [ticket],
      evidence,
      live: live([check("test", "pending", minutesAgo(21))]),
      ciLocal: null,
      smoke: smoked,
      mergeOrderNote: null,
      reviewRoles: REVIEW_ROLES,
      now: NOW,
    });
    expect(conditions[0]?.missing).toBe("test stuck");
  });
});

describe("local CI evidence", () => {
  const ticket = ticketOf({ key: "T-1", pr: 12, verdicts: clean });
  const ciMissing = (fields: Partial<ReadinessInput>) =>
    evaluateReadiness({
      ticket,
      tickets: [ticket],
      evidence,
      live: live([], "abc1234def"),
      ciLocal: null,
      smoke: smoked,
      mergeOrderNote: null,
      reviewRoles: REVIEW_ROLES,
      now: NOW,
      ...fields,
    })[0]?.missing;
  const passing = "abc1234def\n$ vp run check:changed\nexit=0\nengine untouched\nengine-exit=0\n";

  it("Given a ci-local.txt, when it is parsed, then it holds the head SHA and every exit line", () => {
    expect(parseCiLocal(passing)).toEqual({
      kind: "run",
      headSha: "abc1234def",
      exits: [
        { label: "exit", code: 0 },
        { label: "engine-exit", code: 0 },
      ],
    });
  });

  it("Given a ci-local.txt without a SHA or without exit lines, when it is parsed, then it says why it is unreadable", () => {
    expect(parseCiLocal("=== vp test run ===\nexit=0\n")).toEqual({
      kind: "unreadable",
      reason: "ci-local.txt has no head SHA on line 1",
    });
    expect(parseCiLocal("abc1234def\nstill running\n")).toEqual({
      kind: "unreadable",
      reason: "ci-local.txt has no exit codes",
    });
  });

  it("Given no reported checks and a passing ci-local.txt on the head, when readiness is computed, then CI is met", () => {
    expect(ciMissing({ ciLocal: parseCiLocal(passing) })).toBeNull();
  });

  it("Given no reported checks and a ci-local.txt on another commit, when readiness is computed, then CI names the stale SHA", () => {
    expect(ciMissing({ ciLocal: parseCiLocal(passing.replace("abc1234def", "0ff1ce0")) })).toBe(
      "ci-local.txt ran on 0ff1ce0, not abc1234",
    );
  });

  it("Given no reported checks and a ci-local.txt with a failing step, when readiness is computed, then CI names the step", () => {
    expect(
      ciMissing({ ciLocal: parseCiLocal(passing.replace("engine-exit=0", "engine-exit=1")) }),
    ).toBe("ci-local.txt has engine-exit=1");
    expect(
      ciMissing({ ciLocal: parseCiLocal(passing.replace("engine-exit=0", "engine-exit=-1")) }),
    ).toBe("ci-local.txt has engine-exit=-1");
  });

  it("Given no reported checks and no ci-local.txt, when readiness is computed, then CI says both are missing", () => {
    expect(ciMissing({})).toBe("No checks reported and no ci-local.txt");
  });

  it("Given a failing reported check and a passing ci-local.txt, when readiness is computed, then the check wins", () => {
    expect(
      ciMissing({
        live: live([check("test", "failure")], "abc1234def"),
        ciLocal: parseCiLocal(passing),
      }),
    ).toBe("test failing");
  });
});

describe("the ticket a merge approval is about", () => {
  const keys = ["T-1", "T-10", "XEO-3330"];

  it("Given a title naming T-10, when it is matched, then T-10 wins over T-1", () => {
    expect(mergeTicketKey({ id: "m1", title: "[T-10] Ready to merge" }, keys)).toBe("T-10");
  });

  it("Given an item that names its ticket, when it is matched, then the named ticket wins over the title", () => {
    expect(mergeTicketKey({ id: "m1", title: "[T-10] Ready", ticket: "T-1" }, keys)).toBe("T-1");
  });

  it("Given a title that names no ticket, when it is matched, then nothing is found", () => {
    expect(mergeTicketKey({ id: "m1", title: "Ship it" }, keys)).toBeNull();
  });
});

describe("smoke evidence", () => {
  const SMOKE = [
    "Head: abc1234",
    "Surface: T3 browser on dev:web",
    "Method: smoke.md",
    "PASS: item one",
    "PROXY: item two, a stubbed window.board",
    "NOT RUN: item three",
  ].join("\n");

  const unreadable: Smoke = { kind: "unreadable", reason: "smoke.txt is not text" };

  it.each([
    ["no file", null, "No smoke.txt in the evidence"],
    ["an unreadable file", unreadable, "smoke.txt is not text"],
    [
      "no Surface line",
      parseSmoke("Head: abc1234\nPASS: item one"),
      "smoke.txt has no Surface: line",
    ],
    [
      "an empty Surface line",
      parseSmoke("Surface:  \nPASS: item one"),
      "smoke.txt has no Surface: line",
    ],
    ["Surface: none", parseSmoke("Surface: None\nPASS: item one"), "smoke.txt says Surface: none"],
    [
      "Surface: none with a note",
      parseSmoke("Surface: none (no UI run)\nPASS: item one"),
      "smoke.txt says Surface: none",
    ],
    ["a named surface", parseSmoke(SMOKE), null],
  ])("Given %s, when the gate is judged, then it is %j", (_name, smoke, missing) => {
    expect(smokeState(smoke)).toBe(missing);
  });

  it("Given a smoke file with PROXY and NOT RUN items, when readiness is computed, then the smoke condition lists them", () => {
    const ticket = ticketOf({ key: "T-1", pr: 12, verdicts: clean });
    const conditions = evaluateReadiness({
      ticket,
      tickets: [ticket],
      evidence,
      live: green,
      ciLocal: null,
      smoke: parseSmoke(SMOKE),
      mergeOrderNote: null,
      reviewRoles: REVIEW_ROLES,
      now: NOW,
    });
    expect(missingKeys(conditions)).toEqual([]);
    expect(conditions.find((condition) => condition.key === "smoke_named")?.notes).toEqual([
      "PROXY: item two, a stubbed window.board",
      "NOT RUN: item three",
    ]);
  });
});
