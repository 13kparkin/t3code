import { describe, expect, it } from "vite-plus/test";

import { findingsFor, hasStoreFinding, type MergeApproval } from "./findings";
import type { PrLive } from "./readiness";
import { parseTickets, type Ticket } from "./ticket";

const card = (unmet: ReadonlyArray<string> = []): MergeApproval => {
  const condition = (key: string) => ({ met: !unmet.includes(key) });
  return {
    id: "c",
    title: "Merge",
    body: "",
    status: "open",
    createdAt: "t",
    kind: "merge_approval",
    conditions: {
      ci_green: condition("ci_green"),
      reviews_fixed: condition("reviews_fixed"),
      delta_rereviewed: condition("delta_rereviewed"),
      readmes_pass: condition("readmes_pass"),
      parent_ready: condition("parent_ready"),
      smoke_named: condition("smoke_named"),
    },
  };
};
const live = (headSha: string | null, state: PrLive["state"] = "open"): PrLive => ({
  state,
  checksState: null,
  mergeability: "unknown",
  headSha,
  checks: [],
  url: null,
});
const merged: Ticket = {
  key: "T-44",
  title: "x",
  stage: "merged",
  pr: 44,
  headSha: "abc1234def",
  verdicts: [{ role: "verify" }],
};
const ids = (
  ticket: Ticket,
  cards: ReadonlyArray<MergeApproval> = [card()],
  l: PrLive | null = null,
) => findingsFor(ticket, { cards, live: l }).map((finding) => finding.id);

describe("ticket-frame findings", () => {
  interface Case {
    readonly bad: Ticket;
    readonly badCards: ReadonlyArray<MergeApproval>;
    readonly badLive: PrLive | null;
    readonly good: Ticket;
    readonly goodCards: ReadonlyArray<MergeApproval>;
    readonly goodLive: PrLive | null;
  }
  const inPr: Ticket = { ...merged, stage: "pr" };
  const cases = {
    "no-merge-card": {
      bad: { ...merged, key: "T3-12" },
      badCards: [],
      badLive: null,
      good: merged,
      goodCards: [card()],
      goodLive: null,
    },
    "head-drift": {
      bad: inPr,
      badCards: [],
      badLive: live("fff9999"),
      good: inPr,
      goodCards: [],
      goodLive: live("abc1234"),
    },
    "no-verify-verdict": {
      bad: { ...inPr, verdicts: [{ role: "reviewer" }] },
      badCards: [],
      badLive: null,
      good: inPr,
      goodCards: [],
      goodLive: null,
    },
    "unmet-card-condition": {
      bad: merged,
      badCards: [card(["ci_green", "parent_ready"])],
      badLive: null,
      good: merged,
      goodCards: [card(["ci_green"]), card()],
      goodLive: null,
    },
    "stale-record": {
      bad: { ...merged, steps: [{ text: "s", state: "pending" }] },
      badCards: [card()],
      badLive: null,
      good: { ...merged, steps: [{ text: "s", state: "done" }] },
      goodCards: [card()],
      goodLive: null,
    },
    "no-head-sha": {
      bad: { key: "T-1", title: "x", stage: "reviewing" },
      badCards: [],
      badLive: null,
      good: { key: "T-1", title: "x", stage: "reviewing", headSha: "abc1234" },
      goodCards: [],
      goodLive: null,
    },
  } satisfies Record<string, Case>;

  it.each(Object.entries(cases))(
    "Given a ticket for %s, when it is fixed, then the finding clears",
    (id, c) => {
      expect(ids(c.bad, c.badCards, c.badLive)).toContain(id);
      expect(ids(c.good, c.goodCards, c.goodLive)).not.toContain(id);
    },
  );

  it("Given a queued flag on a merged ticket, then it is stale", () => {
    expect(ids({ ...merged, flags: ["queued"] })).toEqual(["stale-record"]);
  });

  it("Given merged tickets with no PR (investigation) or a clean record, then nothing fires", () => {
    expect(ids({ key: "T-45", title: "x", stage: "merged" }, [])).toEqual([]);
    expect(ids(merged)).toEqual([]);
  });

  it("Given a null live head, a closed PR, or a prefix of the head, then head-drift stays quiet", () => {
    const pr = { ...merged, stage: "pr" as const };
    expect(ids(pr, [], live(null))).toEqual([]);
    expect(ids(pr, [], live("fff9999", "closed"))).toEqual([]);
    expect(ids(pr, [], live("abc1234"))).toEqual([]);
  });

  it("Given a drifted head, then the text names both heads", () => {
    const [finding] = findingsFor(
      { ...merged, stage: "pr" },
      { cards: [], live: live("fff9999000") },
    );
    expect(finding?.text).toBe("Ticket head abc1234 is not the PR head fff9999");
  });

  it("Given an old board's minimal ticket and no cards, then it decodes and flags nothing", () => {
    const parsed = parseTickets('[{"key":"T-1","title":"a","stage":"merged"}]');
    expect(parsed._tag).toBe("Success");
    if (parsed._tag === "Success")
      expect(findingsFor(parsed.success[0]!, { cards: [], live: null })).toEqual([]);
  });

  it("Given a store finding, then the layout is told, and a live-only finding is not store", () => {
    expect(hasStoreFinding({ ...merged, key: "T3-12" }, [])).toBe(true);
    expect(hasStoreFinding({ ...merged, stage: "pr" }, [])).toBe(false);
  });
});
