import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import { parseBoard, serializeBoard, slugify, uniqueSlug } from "./board";

const valid = {
  id: "7f4c2a6e-0d3b-4e3b-9a55-0b7a4c1d2e90",
  slug: "claude-connector",
  name: "Claude connector",
  projectId: "586df7d0-cfc5-44b8-957a-ae03fb872e67",
  orchestratorThreadId: null,
  createdAt: "2026-11-20T06:00:00.000Z",
  archived: false,
  builderCap: 2,
  docs: [{ name: "spec.md", sentAt: "2026-11-20T06:05:00.000Z" }],
};

describe("parseBoard", () => {
  it("Given a valid board.json, when decoded, then it returns the board", () => {
    const result = parseBoard(JSON.stringify(valid));
    expect(Result.isSuccess(result) && result.success.name).toBe("Claude connector");
  });

  it("Given a board.json whose orchestrator thread is set, when decoded, then it keeps the id", () => {
    const result = parseBoard(JSON.stringify({ ...valid, orchestratorThreadId: "thread:x" }));
    expect(Result.isSuccess(result) && result.success.orchestratorThreadId).toBe("thread:x");
  });

  it("Given a board.json with no name, when decoded, then the error names the name field", () => {
    const { name: _name, ...withoutName } = valid;
    const result = parseBoard(JSON.stringify(withoutName));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.fields).toEqual(["name"]);
      expect(result.failure.message).toContain("name");
    }
  });

  it("Given a board.json with two bad fields, when decoded, then the error names both", () => {
    const result = parseBoard(JSON.stringify({ ...valid, archived: "yes", builderCap: 0 }));
    expect(Result.isFailure(result) && result.failure.fields).toEqual(["archived", "builderCap"]);
  });

  it("Given role targets, when decoded, then each role keeps its model and effort, and an empty model is a bad field", () => {
    const roleTargets = {
      reviewer: { model: "claude-opus-5-5", effort: "high" },
      sonic: { model: "claude-sonnet-5-5" },
    };
    const result = parseBoard(JSON.stringify({ ...valid, roleTargets }));
    expect(Result.isSuccess(result) && result.success.roleTargets).toEqual(roleTargets);
    const bad = parseBoard(JSON.stringify({ ...valid, roleTargets: { reviewer: { model: "" } } }));
    expect(Result.isFailure(bad) && bad.failure.fields).toEqual(["roleTargets"]);
  });

  it("Given a board with two calls, when decoded, then both calls keep their fields", () => {
    const calls = [
      { id: "c1", title: "Design sync", start: "2026-11-26T15:00:00.000Z", app: "zoom" },
      { id: "c2", title: "Standup", start: "2026-11-27T09:30:00+01:00", app: "edge" },
    ];
    const result = parseBoard(JSON.stringify({ ...valid, calls }));
    expect(Result.isSuccess(result) && result.success.calls).toEqual(calls);
  });

  it("Given a call with an unknown app, when decoded, then the error names the calls field", () => {
    const calls = [
      { id: "c1", title: "Design sync", start: "2026-11-26T15:00:00.000Z", app: "skype" },
    ];
    const result = parseBoard(JSON.stringify({ ...valid, calls }));
    expect(Result.isFailure(result) && result.failure.fields).toEqual(["calls"]);
  });

  it("Given text that is not JSON, when decoded, then it fails without naming a field", () => {
    const result = parseBoard("{ nope");
    expect(Result.isFailure(result) && result.failure.fields).toEqual([]);
  });

  it("Given a board, when serialized and decoded again, then nothing changes", () => {
    const first = parseBoard(JSON.stringify(valid));
    if (!Result.isSuccess(first)) throw new Error("fixture must decode");
    const again = parseBoard(serializeBoard(first.success));
    expect(Result.isSuccess(again) && again.success).toEqual(first.success);
  });
});

describe("slugify", () => {
  it("Given Claude connector, when slugified, then it is claude-connector", () => {
    expect(slugify("Claude connector")).toBe("claude-connector");
  });

  it("Given symbols and edge spaces, when slugified, then only letters and digits stay", () => {
    expect(slugify("  Claude / connector!  ")).toBe("claude-connector");
  });

  it("Given a name with no letters or digits, when slugified, then it falls back to board", () => {
    expect(slugify("!!!")).toBe("board");
  });
});

describe("uniqueSlug", () => {
  it.each([
    ["no clash", [], "claude-connector"],
    ["the slug taken", ["claude-connector"], "claude-connector-2"],
    ["2 taken too", ["claude-connector", "claude-connector-2"], "claude-connector-3"],
  ])("Given %s, when slugified, then it is %s", (_clash, taken, expected) => {
    expect(uniqueSlug("Claude connector", taken)).toBe(expected);
  });
});
