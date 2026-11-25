import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import {
  missingPlan,
  missingSources,
  noteText,
  parseTickets,
  stepProgress,
  type Ticket,
} from "./ticket";

const issueOf = (text: string) => {
  const parsed = parseTickets(text);
  if (Result.isSuccess(parsed)) throw new Error("expected the tickets to be rejected");
  return parsed.failure;
};

describe("tickets.json", () => {
  it("Given a ticket with every field, when it is parsed, then each field is kept", () => {
    const ticket = {
      key: "T-1",
      title: "Add login",
      stage: "building",
      track: "auth",
      dependsOn: ["T-0"],
      flags: ["blocked"],
      branch: "feat/login",
      base: "main",
      worktreePath: "/p/wt",
      pr: 12,
      headSha: "abc1234",
      summary: "Adds the form",
      description: "The long text.",
      why: "Users need it",
      threads: [{ threadId: "th-1", role: "task", round: 1 }],
      verdicts: [{ role: "reviewer", p0: 0, p1: 1, p2: 0, p3: 2 }],
      fixRounds: 1,
      issue: { tracker: "url", key: "https://example.com/a" },
      playbook: "feature.md",
      steps: [
        { text: "Write the plan", state: "done" },
        { text: "Run the demo", state: "skipped", note: "No UI change" },
        { text: "Open the PR", state: "pending" },
      ],
    };
    const parsed = parseTickets(JSON.stringify([ticket]));
    expect(Result.isSuccess(parsed) ? parsed.success : null).toEqual([ticket]);
  });

  it("Given a ticket with only key, title, and stage, when it is parsed, then it is accepted", () => {
    const parsed = parseTickets('[{"key":"T-1","title":"a","stage":"planned"}]');
    expect(Result.isSuccess(parsed)).toBe(true);
  });

  it("Given a step with an unknown state, when it is parsed, then it is rejected and names steps", () => {
    const issue = issueOf(
      '[{"key":"T-1","title":"a","stage":"todo","steps":[{"text":"x","state":"half"}]}]',
    );
    expect(issue.fields).toEqual(["steps"]);
  });

  it("Given the stage done, when it is parsed, then it is rejected and names stage", () => {
    const issue = issueOf('[{"key":"T-1","title":"a","stage":"done"}]');
    expect(issue.fields).toEqual(["stage"]);
    expect(issue.message).toContain("tickets.json is invalid: ");
    expect(issue.message).toContain("0.stage");
  });

  it("Given a missing title and a bad fix round count, when it is parsed, then both fields are named", () => {
    const issue = issueOf('[{"key":"T-1","stage":"planned","fixRounds":-1}]');
    expect(issue.fields).toEqual(["title", "fixRounds"]);
  });

  it("Given two tickets with one key, when it is parsed, then it is rejected and names key", () => {
    const issue = issueOf(
      '[{"key":"T-1","title":"a","stage":"planned"},{"key":"T-1","title":"b","stage":"merged"}]',
    );
    expect(issue).toEqual({
      fields: ["key"],
      message: "tickets.json is invalid: key T-1 is used by two tickets",
    });
  });

  it("Given text that is not a list, when it is parsed, then it is rejected as a file problem", () => {
    expect(issueOf("not json").fields).toEqual([]);
    expect(issueOf('{"key":"T-1"}').fields).toEqual([]);
  });
});

describe("plans and steps", () => {
  const ticket = (fields: Partial<Ticket>): Ticket => ({
    key: "T-1",
    title: "a",
    stage: "planned",
    ...fields,
  });
  const steps = [
    { text: "a", state: "done" },
    { text: "b", state: "skipped", note: "n/a" },
    { text: "c", state: "pending" },
  ] as const;

  it.each([
    ["todo without a plan", { stage: "todo" }, false],
    ["planned without a plan", {}, true],
    ["planned with a playbook and no steps", { playbook: "feature.md", steps: [] }, true],
    ["building with both", { stage: "building", playbook: "feature.md", steps }, false],
    ["off_path without a plan", { stage: "off_path" }, false],
    ["merged without a plan", { stage: "merged" }, false],
  ] as const)("Given %s, when checked, then missingPlan is %s", (_, fields, expected) => {
    expect(missingPlan(ticket(fields))).toBe(expected);
  });

  const cited = "# Design\n\n## Sources\n\n- https://example.org, the pattern\n";
  it.each([
    [
      "a design note with sources",
      { stage: "building" },
      { design: cited, diagnosis: null },
      false,
    ],
    [
      "a design note without sources",
      { stage: "building" },
      { design: "# Design\n", diagnosis: null },
      true,
    ],
    ["no design note", { stage: "building" }, { design: null, diagnosis: null }, false],
    [
      "a bug fix with no diagnosis",
      { stage: "building", playbook: "bug-fix.md" },
      { design: null, diagnosis: null },
      true,
    ],
    [
      "a bug fix whose diagnosis has no sources",
      { stage: "verifying", playbook: "bug-fix.md" },
      { design: null, diagnosis: "# Cause\n" },
      true,
    ],
    [
      "a bug fix whose diagnosis cites sources",
      { stage: "building", playbook: "bug-fix.md" },
      { design: null, diagnosis: cited },
      false,
    ],
    ["a planned bug fix", { playbook: "bug-fix.md" }, { design: null, diagnosis: null }, false],
    [
      "a note not read yet",
      { stage: "building", playbook: "bug-fix.md" },
      { design: undefined, diagnosis: undefined },
      false,
    ],
  ] as const)("Given %s, when checked, then missingSources is %s", (_, fields, notes, expected) => {
    expect(missingSources(ticket(fields), notes)).toBe(expected);
  });

  it.each([
    ["the evidence list still loading", false, null, undefined],
    ["a listed note still reading", true, { status: "loading" }, undefined],
    ["no note in a loaded list", true, null, null],
    [
      "a read note",
      true,
      {
        status: "done",
        contents: { kind: "text", contents: "# D", byteLength: 3, truncated: false },
      },
      "# D",
    ],
  ] as const)("Given %s, when read, then the note text matches", (_, listed, read, expected) => {
    expect(noteText(listed, read)).toBe(expected);
  });

  it("Given steps, when counted, then done and skipped are totalled, and no steps gives null", () => {
    expect(stepProgress(ticket({ steps }))).toEqual({ done: 1, skipped: 1, total: 3 });
    expect(stepProgress(ticket({}))).toBeNull();
  });
});
