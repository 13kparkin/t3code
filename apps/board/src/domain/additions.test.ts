import { describe, expect, it } from "vite-plus/test";

import { type Block, lineText, parseAdditions, resolveBlock, visibleAdditions } from "./additions";
import type { Ticket } from "./ticket";

const AS_OF = "2026-11-23T09:40:00Z";
const text = (value = "x") => ({ type: "text", text: value });
type Json = string | number | boolean | ReadonlyArray<Json> | Fields;
interface Fields {
  readonly [key: string]: Json;
}
const item = (id: string, place: string, fields: Fields = {}) => ({
  id,
  title: "Title",
  asOf: AS_OF,
  place,
  blocks: [text()],
  ...fields,
});
const canvas = (id: string, blocks: ReadonlyArray<Fields>) => item(id, "canvas", { blocks });

const json = (value: ReadonlyArray<Fields> | Fields) => JSON.stringify(value);
const parsed = (file: string) => {
  const result = parseAdditions(file);
  return { ids: result.items?.map((entry) => entry.id) ?? null, problems: result.problems };
};

describe("additions.json", () => {
  it.each([
    [
      "one item per placement",
      json([
        canvas("review-wait", [
          { type: "stat", label: "Tickets", stages: ["reviewing", "awaiting_approval"] },
          { type: "list", stages: ["reviewing"] },
        ]),
        item("pr-checks", "lane", {
          lane: "pr",
          recipe: "gh pr checks",
          blocks: [{ type: "table", columns: ["PR", "CI"], rows: [["#412", "green"]] }],
        }),
        item("t47-audit", "ticket", {
          ticket: "T-47",
          blocks: [
            text("Three findings open"),
            { type: "list", items: [{ ticket: "T-87" }, { text: "Prototype", done: false }] },
            { type: "link", label: "Notes", href: "https://github.com/o/r/issues/47" },
          ],
        }),
        item("t47-reviewer", "glance", { ticket: "T-47" }),
        item("next-up", "orchestrator", {
          blocks: [{ type: "stat", label: "Next", value: "T-47" }],
        }),
      ]),
      {
        ids: ["review-wait", "pr-checks", "t47-audit", "t47-reviewer", "next-up"],
        problems: [],
      },
    ],
    [
      "a file that is not JSON",
      "{",
      { ids: null, problems: ["additions.json is not a JSON array: Expected a valid JSON string"] },
    ],
    [
      "a file that is not an array",
      json({ items: [] }),
      { ids: null, problems: ["additions.json is not a JSON array: Expected array"] },
    ],
    [
      "an unknown block type among good items",
      json([canvas("a", [text()]), canvas("b", [{ type: "chart" }]), canvas("c", [text()])]),
      {
        ids: ["a", "c"],
        problems: [
          'additions.json "b" blocks.0 Expected { readonly "type": "text", ... } | { readonly "type": "stat", ... } | { readonly "type": "list", ... } | { readonly "type": "table", ... } | { readonly "type": "link", ... }',
        ],
      },
    ],
    [
      "a duplicate id",
      json([canvas("a", [text()]), canvas("a", [text("again")])]),
      { ids: ["a"], problems: ['additions.json "a" id is used by an earlier item'] },
    ],
    [
      "a lane item with no lane",
      json([item("a", "lane")]),
      { ids: [], problems: ['additions.json "a" lane Missing key'] },
    ],
    [
      "a lane item in off path, which has no lane",
      json([item("a", "lane", { lane: "off_path" })]),
      {
        ids: [],
        problems: [
          'additions.json "a" lane Expected "todo" | "planned" | "building" | "reviewing" | "verifying" | "pr" | "awaiting_approval" | "merged"',
        ],
      },
    ],
    [
      "a ticket item with no ticket",
      json([item("a", "ticket")]),
      { ids: [], problems: ['additions.json "a" ticket Missing key'] },
    ],
    [
      "a glance item with no ticket",
      json([item("a", "glance")]),
      { ids: [], problems: ['additions.json "a" ticket Missing key'] },
    ],
    [
      "a glance item with two blocks",
      json([item("a", "glance", { ticket: "T-1", blocks: [text(), text()] })]),
      {
        ids: [],
        problems: ['additions.json "a" blocks Expected a value with a length of at most 1'],
      },
    ],
    [
      "a glance title that is a built-in line",
      json([item("a", "glance", { ticket: "T-1", title: "Size" })]),
      { ids: [], problems: ['additions.json "a" title is a built-in At a glance line: Size'] },
    ],
    [
      "a stat with both a value and stages",
      json([canvas("a", [{ type: "stat", label: "n", value: "1", stages: ["pr"] }])]),
      { ids: [], problems: ['additions.json "a" blocks.0 needs exactly one of value or stages'] },
    ],
    [
      "a list row with neither text nor ticket",
      json([canvas("a", [{ type: "list", items: [{ done: true }] }])]),
      { ids: [], problems: ['additions.json "a" blocks.0.items.0 needs text or ticket'] },
    ],
    [
      "a stage that does not exist",
      json([canvas("a", [{ type: "list", stages: ["done"] }])]),
      {
        ids: [],
        problems: [
          'additions.json "a" blocks.0.stages.0 Expected "todo" | "planned" | "building" | "reviewing" | "verifying" | "pr" | "awaiting_approval" | "merged" | "off_path"',
        ],
      },
    ],
    [
      "a javascript: link",
      json([canvas("a", [{ type: "link", label: "x", href: "javascript:alert(1)" }])]),
      { ids: [], problems: ['additions.json "a" blocks.0.href must be an http or https link'] },
    ],
    [
      "a link with no host, which no URL parses",
      json([canvas("a", [{ type: "link", label: "x", href: "https://" }])]),
      { ids: [], problems: ['additions.json "a" blocks.0.href must be an http or https link'] },
    ],
    [
      "a relative link",
      json([canvas("a", [{ type: "link", label: "x", href: "/tickets" }])]),
      { ids: [], problems: ['additions.json "a" blocks.0.href must be an http or https link'] },
    ],
    [
      "a time that does not parse",
      json([item("a", "canvas", { asOf: "yesterday" })]),
      { ids: [], problems: ['additions.json "a" asOf must be an ISO time'] },
    ],
    [
      "an item with no id, named by its index",
      json([{ title: "x", asOf: AS_OF, place: "canvas", blocks: [text()] }]),
      { ids: [], problems: ['additions.json "#0" id Missing key'] },
    ],
    [
      "text past 500 characters",
      json([canvas("a", [text("x".repeat(501))])]),
      {
        ids: [],
        problems: [
          'additions.json "a" blocks.0.text Expected a value with a length of at most 500',
        ],
      },
    ],
    [
      "13 items",
      json(Array.from({ length: 13 }, (_, at) => item(`t${at}`, "ticket", { ticket: "T-1" }))),
      {
        ids: Array.from({ length: 12 }, (_, at) => `t${at}`),
        problems: ['additions.json "t12" (item) is past the 12-item cap'],
      },
    ],
    [
      "5 canvas items",
      json(Array.from({ length: 5 }, (_, at) => canvas(`c${at}`, [text()]))),
      {
        ids: ["c0", "c1", "c2", "c3"],
        problems: ['additions.json "c4" place is past the cap of 4 canvas items'],
      },
    ],
    [
      "4 orchestrator items",
      json(Array.from({ length: 4 }, (_, at) => item(`o${at}`, "orchestrator"))),
      {
        ids: ["o0", "o1", "o2"],
        problems: ['additions.json "o3" place is past the cap of 3 orchestrator items'],
      },
    ],
    [
      "2 items in one lane",
      json([item("a", "lane", { lane: "pr" }), item("b", "lane", { lane: "pr" })]),
      { ids: ["a"], problems: ['additions.json "b" lane already has an item: pr'] },
    ],
    [
      "21 list rows",
      json([
        canvas("a", [{ type: "list", items: Array.from({ length: 21 }, () => ({ text: "x" })) }]),
      ]),
      {
        ids: [],
        problems: [
          'additions.json "a" blocks.0.items Expected a value with a length of at most 20',
        ],
      },
    ],
    [
      "8 bad items, past the problem cap",
      json(Array.from({ length: 8 }, (_, at) => item(`b${at}`, "lane"))),
      {
        ids: [],
        problems: [
          'additions.json "b0" lane Missing key',
          'additions.json "b1" lane Missing key',
          'additions.json "b2" lane Missing key',
          'additions.json "b3" lane Missing key',
          'additions.json "b4" lane Missing key',
          "additions.json: …and 3 more",
        ],
      },
    ],
    [
      "a bad item with a long id",
      json([item("x".repeat(50), "canvas")]),
      {
        ids: [],
        problems: [
          `additions.json "${"x".repeat(40)}…" id Expected a string matching the RegExp ^[a-z0-9-]{1,40}$`,
        ],
      },
    ],
    [
      "stages listed past the number of stages",
      json([canvas("a", [{ type: "list", stages: Array.from({ length: 10 }, () => "pr") }])]),
      {
        ids: [],
        problems: [
          'additions.json "a" blocks.0.stages Expected a value with a length of at most 9',
        ],
      },
    ],
    [
      "7 table columns",
      json([
        canvas("a", [{ type: "table", columns: ["1", "2", "3", "4", "5", "6", "7"], rows: [] }]),
      ]),
      {
        ids: [],
        problems: [
          'additions.json "a" blocks.0.columns Expected a value with a length of at most 6',
        ],
      },
    ],
  ])("Given %s, when it is parsed, then it keeps the right items", (_name, file, expected) => {
    expect(parsed(file)).toEqual(expected);
  });
});

const tickets: ReadonlyArray<Ticket> = [
  { key: "T-1", title: "Fix poll", stage: "reviewing" },
  { key: "T-2", title: "Add lane", stage: "building" },
  { key: "T-3", title: "Ship it", stage: "awaiting_approval" },
];

describe("resolveBlock", () => {
  it.each<[string, Block, unknown]>([
    [
      "a live count",
      { type: "stat", label: "Waiting", stages: ["reviewing", "awaiting_approval"] },
      { type: "stat", label: "Waiting", value: "2" },
    ],
    [
      "a literal value",
      { type: "stat", label: "Next", value: "T-47" },
      { type: "stat", label: "Next", value: "T-47" },
    ],
    [
      "a live list in file order",
      { type: "list", stages: ["awaiting_approval", "reviewing"] },
      {
        type: "list",
        rows: [
          { text: "T-1 Fix poll (Reviewing)", ticket: "T-1" },
          { text: "T-3 Ship it (Awaiting approval)", ticket: "T-3" },
        ],
      },
    ],
    [
      "ticket rows for a known and an unknown key",
      {
        type: "list",
        items: [
          { ticket: "T-2", text: "blocked", done: true },
          { ticket: "T-404" },
          { text: "Plain" },
        ],
      },
      {
        type: "list",
        rows: [
          { text: "T-2 Add lane (Building) · blocked", ticket: "T-2", done: true },
          { text: "T-404" },
          { text: "Plain" },
        ],
      },
    ],
    [
      "a link",
      { type: "link", label: "Notes", href: "https://github.com/o/r/issues/47" },
      {
        type: "link",
        label: "Notes",
        href: "https://github.com/o/r/issues/47",
        host: "github.com",
      },
    ],
  ])("Given %s, when it resolves, then it draws the current tickets", (_name, block, expected) => {
    expect(resolveBlock(block, tickets)).toEqual(expected);
  });

  it("Given a glance stat over stages, when its line is read, then it is the live count", () => {
    const [entry] =
      parseAdditions(
        JSON.stringify([
          item("waiting", "glance", {
            ticket: "T-1",
            blocks: [{ type: "stat", label: "n", stages: ["building"] }],
          }),
        ]),
      ).items ?? [];
    expect(entry === undefined ? null : lineText(entry, tickets)).toBe("1");
  });
});

describe("visibleAdditions", () => {
  it("Given hidden ids, when the shown items are picked, then the hidden ones are left out", () => {
    const items =
      parseAdditions(JSON.stringify([canvas("a", [text()]), canvas("b", [text()])])).items ?? [];
    expect(visibleAdditions(items, ["a", "gone"]).map((entry) => entry.id)).toEqual(["b"]);
  });
});
