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
    [
      "a 401-character ticket note",
      { ...NOTES, ticketNotes: [{ ticket: "T-42", text: "x".repeat(401) }] },
      "ticketNotes.0.text",
    ],
  ])("Given %s, when parsed, then the failure names the field", (_, file, field) => {
    const parsed = parseCallNotes(JSON.stringify(file));
    expect(Result.isFailure(parsed) && parsed.failure).toContain(
      `notes.json is invalid: ${field} `,
    );
  });

  it("Given text that is not JSON, when parsed, then it says so", () => {
    const parsed = parseCallNotes("{");
    expect(Result.isFailure(parsed) && parsed.failure).toMatch(/^notes\.json is invalid: /);
  });

  it("Given a ticket note and a new-work item, when their For you ids are made, then they are the brief's lowercase ids and differ for a NEW-1 ticket", () => {
    expect(callNotesForYouId(NOTES.callId, "t-NEW-1")).toBe("call-1a2b3c4d-t-new-1");
    expect(callNotesForYouId(NOTES.callId, "n-1")).toBe("call-1a2b3c4d-n-1");
  });

  it("Given notes with no decisions, when they become Markdown, then there is no Decisions section", () => {
    const markdown = callNotesMarkdown("Design sync", { ...NOTES, decisions: [] });
    expect(markdown).not.toContain("## Decisions");
    expect(markdown).toContain("## Actions\n\n- Me: Land T-42 today\n");
  });
});
