import { describe, expect, it } from "vite-plus/test";

import { dueCalls, markNotified, nextWake, shownCalls } from "./dueCalls";

const NOW = Date.parse("2026-11-26T10:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const CALLS = [
  { id: "later", start: at(1) },
  { id: "now", start: at(0) },
  { id: "nine-late", start: at(-9) },
  { id: "eleven-late", start: at(-11) },
];

describe("which calls notify now", () => {
  it.each([
    ["nothing notified yet", {}, ["now", "nine-late"]],
    ["one already notified", { now: at(0) }, ["nine-late"]],
    ["one notified for a start it has since moved from", { now: at(-30) }, ["now", "nine-late"]],
  ])("Given %s, then the due ids are %j", (_name, notified, ids) => {
    expect(dueCalls(CALLS, NOW, notified).map((call) => call.id)).toEqual(ids);
  });
});

describe("when the scheduler wakes next", () => {
  it.each([
    ["a call starts later", CALLS, NOW + 60_000],
    ["only open windows", [{ id: "nine-late", start: at(-9) }], NOW + 60_000],
    ["every window has closed", [{ id: "eleven-late", start: at(-11) }], null],
    ["no calls", [], null],
  ])("Given %s, then it wakes at %s", (_name, calls, wake) => {
    expect(nextWake(calls, NOW)).toBe(wake);
  });
});

describe("the notified calls kept in local state", () => {
  it("Given a closed window, an open one, and a due call, then it drops only the closed window", () => {
    expect(markNotified({ "eleven-late": at(-11), "nine-late": at(-9) }, [CALLS[1]!], NOW)).toEqual(
      {
        "nine-late": at(-9),
        now: at(0),
      },
    );
  });
});

describe("which calls the Calls group shows", () => {
  const soon = { id: "soon", start: at(5) };
  const later = { id: "later", start: at(60) };
  const now = { id: "now", start: at(-2) };
  const past = { id: "past", start: at(-30) };
  it.each([
    ["no calls", [], null, []],
    ["one future call", [later], null, ["later"]],
    ["two future calls", [later, soon], null, ["soon"]],
    ["a call starting now and a future call", [later, now], null, ["now", "later"]],
    ["a past finished call", [past], null, []],
    ["a past call still recording", [past, later], "past", ["past", "later"]],
  ])("Given %s, then it shows %j", (_name, calls, recording, ids) => {
    expect(shownCalls(calls, NOW, recording).map((call) => call.id)).toEqual(ids);
  });
});
