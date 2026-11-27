import { describe, expect, it } from "vite-plus/test";

import { splitCalls } from "./splitCalls";

const NOW = Date.parse("2026-11-26T10:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe("where each call goes", () => {
  const hours = (count: number) => at(-count * 60);
  const soon = { id: "soon", start: at(5) };
  const later = { id: "later", start: at(60) };
  const now = { id: "now", start: at(-2) };
  const past = { id: "past", start: at(-30) };
  const elsewhere = { id: "elsewhere", start: at(-30), recordedAt: at(-30) };
  const expired = { id: "expired", start: hours(7 * 24 + 5), recordedAt: hours(7 * 24 + 5) };
  const lateTake = { id: "late", start: hours(7 * 24 + 5), recordedAt: hours(7 * 24 + 3) };
  const none = { shown: [], later: [], finished: [], stale: [], mark: [] };
  const NO_TAKES = new Map<string, string>();
  const takes = (id: string) => new Map([[id, at(-25)]]);
  it.each([
    ["no calls", [], null, NO_TAKES, none],
    ["one future call", [later], null, NO_TAKES, { ...none, shown: ["later"] }],
    [
      "two future calls",
      [later, soon],
      null,
      NO_TAKES,
      { ...none, shown: ["soon"], later: ["later"] },
    ],
    [
      "a call starting now and a future call",
      [later, now],
      null,
      NO_TAKES,
      { ...none, shown: ["now", "later"] },
    ],
    [
      "a finished call with takes",
      [past],
      null,
      takes("past"),
      { ...none, finished: ["past"], mark: ["past"] },
    ],
    ["a finished call without takes", [past], null, NO_TAKES, { ...none, stale: ["past"] }],
    [
      "a finished call recorded on another PC",
      [elsewhere],
      null,
      NO_TAKES,
      { ...none, finished: ["elsewhere"] },
    ],
    [
      "a marked call whose takes this PC holds",
      [elsewhere],
      null,
      takes("elsewhere"),
      { ...none, finished: ["elsewhere"] },
    ],
    [
      "a marked call past the life of any take, with none here",
      [expired],
      null,
      NO_TAKES,
      { ...none, stale: ["expired"] },
    ],
    [
      "a call whose take started long after its start",
      [lateTake],
      null,
      NO_TAKES,
      { ...none, finished: ["late"] },
    ],
    [
      "a finished call while takes are unknown",
      [past],
      null,
      null,
      { ...none, finished: ["past"] },
    ],
    [
      "a past call recording with no take saved yet",
      [past, later],
      "past",
      NO_TAKES,
      { ...none, shown: ["past", "later"] },
    ],
  ] as const)("Given %s, then it splits them as %j", (_name, calls, recording, local, ids) => {
    const split = splitCalls(calls, NOW, recording, local);
    expect({
      shown: split.shown.map((call) => call.id),
      later: split.later.map((call) => call.id),
      finished: split.finished.map((call) => call.id),
      stale: split.stale.map((call) => call.id),
      mark: split.mark.map((call) => call.id),
    }).toEqual(ids);
  });

  it("Given a call with takes and no mark, then the mark carries its first take's start", () => {
    expect(splitCalls([past], NOW, null, takes("past")).mark).toEqual([
      { ...past, recordedAt: at(-25) },
    ]);
  });
});
