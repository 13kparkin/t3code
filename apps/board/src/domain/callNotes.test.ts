import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import { callNotesForYouId, callNotesMarkdown, parseCallNotes } from "./callNotes";

const NOTES = {
  callId: "1A2B3C4D-5e6f-7a8b-9c0d-112233445566",
  asOf: "2026-11-26T10:45:00Z",
  summary: "Release moves to Friday if T-42 lands today.",
  decisions: ["Ship on Friday"],
  actions: [{ text: "Land T-42 today", who: "me" as const }],
  ticketNotes: [{ ticket: "T-42", text: "Release waits on this landing today." }],
  newWork: [{ title: "Add a release checklist", why: "Nobody knew who signs off." }],
};

describe("call notes", () => {
  it("Given a valid notes.json, when parsed, then it is these exact values", () => {
    expect(parseCallNotes(JSON.stringify(NOTES))).toEqual(Result.succeed(NOTES));
  });

  it.each([
    [
      "five ticket notes",
      {
        ...NOTES,
        ticketNotes: Array.from({ length: 5 }, (_, at) => ({ ticket: `T-${at}`, text: "x" })),
      },
      "ticketNotes",
    ],
    [
      "an action by nobody",
      { ...NOTES, actions: [{ text: "x", who: "them all" }] },
      "actions.0.who",
    ],
    ["a missing summary", { ...NOTES, summary: undefined }, "summary"],
  ])("Given %s, when parsed, then the failure names %s", (_, file, field) => {
    const parsed = parseCallNotes(JSON.stringify(file));
    expect(Result.isFailure(parsed) && parsed.failure).toContain(
      `notes.json is invalid: ${field} `,
    );
  });

  it("Given text that is not JSON, when parsed, then it says so", () => {
    const parsed = parseCallNotes("{");
    expect(Result.isFailure(parsed) && parsed.failure).toMatch(/^notes\.json is invalid: /);
  });

  it("Given a call and a ticket, when the For you id is made, then it is the brief's lowercase id", () => {
    expect(callNotesForYouId(NOTES.callId, "T-42")).toBe("call-1a2b3c4d-t-42");
  });

  it("Given notes, when they become Markdown, then each part is a section", () => {
    expect(callNotesMarkdown("Design sync", NOTES)).toBe(
      [
        "# Design sync call notes",
        "",
        "Release moves to Friday if T-42 lands today.",
        "",
        "## Decisions",
        "",
        "- Ship on Friday",
        "",
        "## Actions",
        "",
        "- Me: Land T-42 today",
        "",
        "## Ticket notes",
        "",
        "- T-42: Release waits on this landing today.",
        "",
        "## New work",
        "",
        "- Add a release checklist: Nobody knew who signs off.",
        "",
      ].join("\n"),
    );
  });
});
