import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "./ticket";
import {
  applyOverlay,
  editOverlay,
  lockedFields,
  type Overlay,
  parseOverlay,
  pullOverlay,
  unlinkOverlay,
  waitingOn,
  wouldCycle,
} from "./ticketOverlay";

const ticket = (key: string, extra: Partial<Ticket> = {}): Ticket => ({
  key,
  title: `${key} title`,
  stage: "todo",
  ...extra,
});

const LINEAR = { tracker: "linear", key: "XEO-1" };
const pulled = (issue = LINEAR) => ({
  issue,
  title: "Tracker title",
  description: "Tracker body",
  url: "https://linear.app/x/issue/XEO-1",
  at: "2026-11-24T10:00:00Z",
});

describe("ticket-details.json layers", () => {
  it("Given an edit and a row, when applied, then the edit replaces the field and the rest follows the row", () => {
    const overlay: Overlay = { "T-1": { edits: { title: "Mine", dependsOn: [] } } };
    const [one] = applyOverlay([ticket("T-1", { dependsOn: ["T-0"], summary: "s" })], overlay);
    expect([one?.title, one?.dependsOn, one?.summary]).toEqual(["Mine", [], "s"]);
  });

  it("Given a Linear link with a pulled copy, when applied, then the tracker's title and description beat the edit", () => {
    const overlay: Overlay = {
      "T-1": { edits: { title: "Mine", issue: LINEAR }, pulled: pulled() },
    };
    const [one] = applyOverlay([ticket("T-1")], overlay);
    expect([one?.title, one?.description]).toEqual(["Tracker title", "Tracker body"]);
  });

  it("Given a plain URL link or a copy pulled for another issue, when applied, then the board's fields stay", () => {
    const url = { tracker: "url", key: "https://example.com/a" };
    const overlay: Overlay = {
      "T-1": { edits: { title: "Mine", issue: url }, pulled: pulled(url) },
      "T-2": { pulled: pulled() },
    };
    const out = applyOverlay(
      [ticket("T-1"), ticket("T-2", { issue: { tracker: "linear", key: "XEO-9" } })],
      overlay,
    );
    expect(out.map((entry) => entry.title)).toEqual(["Mine", "T-2 title"]);
  });

  it("Given an unlink edit, when applied, then the ticket has no issue even when the row has one", () => {
    const overlay: Overlay = { "T-1": { edits: { issue: null } } };
    const [one] = applyOverlay([ticket("T-1", { issue: LINEAR })], overlay);
    expect(one?.issue).toBeUndefined();
  });

  it("Given an entry for a deleted ticket, when applied, then it adds nothing", () => {
    expect(applyOverlay([ticket("T-1")], { "T-9": { edits: { title: "x" } } })).toEqual([
      ticket("T-1"),
    ]);
  });

  it("Given a Linear ticket, when its locked fields are asked, then title and description are held and a URL holds none", () => {
    expect([...lockedFields(ticket("T-1", { issue: LINEAR }))]).toEqual(["title", "description"]);
    expect(
      lockedFields(ticket("T-1", { issue: { tracker: "url", key: "https://a.b" } })).size,
    ).toBe(0);
    expect(lockedFields(ticket("T-1")).size).toBe(0);
  });

  it("Given text that is not the file's shape, when parsed, then it fails with a message", () => {
    expect(Result.isFailure(parseOverlay('{"T-1":{"edits":{"title":3}}}'))).toBe(true);
    expect(Result.isFailure(parseOverlay("{"))).toBe(true);
    expect(Result.isSuccess(parseOverlay("{}"))).toBe(true);
  });
});

describe("changing the layers", () => {
  it("Given a new link, when edited, then the copy pulled for the old issue is dropped", () => {
    const start: Overlay = { "T-1": { edits: { issue: LINEAR }, pulled: pulled() } };
    expect(
      editOverlay(start, "T-1", { issue: { tracker: "github", key: "#2" } })["T-1"]?.pulled,
    ).toBeUndefined();
  });

  it("Given a pulled copy, when the ticket is unlinked, then its text becomes editable and the link is cut", () => {
    const start: Overlay = { "T-1": { edits: { issue: LINEAR }, pulled: pulled() } };
    expect(unlinkOverlay(start, "T-1")).toEqual({
      "T-1": { edits: { issue: null, title: "Tracker title", description: "Tracker body" } },
    });
  });

  it("Given the same pulled values, when pulled again, then the overlay is the same object", () => {
    const start = pullOverlay({}, "T-1", pulled());
    expect(pullOverlay(start, "T-1", { ...pulled(), at: "later" })).toBe(start);
  });
});

describe("prerequisites", () => {
  const graph = [
    ticket("T-1"),
    ticket("T-2", { dependsOn: ["T-1"] }),
    ticket("T-3", { dependsOn: ["T-2"] }),
    ticket("T-4", { dependsOn: ["T-1"] }),
  ];

  it.each([
    ["itself", "T-1", ["T-1"], true],
    ["a direct loop", "T-1", ["T-2"], true],
    ["a three-step loop", "T-1", ["T-3"], true],
    ["a diamond", "T-4", ["T-2", "T-3"], false],
    ["a missing key", "T-4", ["T-404"], false],
  ])("Given %s, when checked, then a cycle is %s", (_name, key, next, cycle) => {
    expect(wouldCycle(graph, key, next) !== null).toBe(cycle);
  });

  it("Given a loop, when checked, then it names the path", () => {
    expect(wouldCycle(graph, "T-1", ["T-3"])).toEqual(["T-1", "T-3", "T-2", "T-1"]);
  });

  it("Given prerequisites, when asked what a ticket waits on, then only the unmerged ones are listed", () => {
    const tickets = [ticket("T-1", { stage: "merged" }), ticket("T-2", { stage: "building" })];
    expect(waitingOn(ticket("T-3", { dependsOn: ["T-1", "T-2", "T-404"] }), tickets)).toEqual([
      "T-2",
      "T-404",
    ]);
  });
});
