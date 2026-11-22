import { describe, expect, it } from "vite-plus/test";

import { detailTarget, emptyText, type Read, resolveLookup } from "./triggerLookup.logic";

const pullRequest = (number: number) => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  updatedAt: "2026-01-01T00:00:00Z",
  repository: "o/r",
});

const initial = { state: "initial" } as const;
const failed = { state: "failed" } as const;
const ready = <A>(value: A): Read<A> => ({ state: "ready", value });
const listOf = (numbers: ReadonlyArray<number>, errors: ReadonlyArray<string> = []) =>
  ready({
    entries: numbers.map(pullRequest),
    errors: errors.map((projectId) => ({ projectId })),
  });
const noFiles = ready({ entries: [] });

const resolve = (
  kind: "file" | "pull-request" | "command",
  reads: Partial<Parameters<typeof resolveLookup>[0]>,
) =>
  resolveLookup({
    kind,
    projectId: "p",
    pullRequestsAvailable: true,
    files: noFiles,
    list: listOf([]),
    detail: null,
    ...reads,
  });

describe("the lookup status and the menu's empty text", () => {
  it.each([
    ["a file search not answered", "file", { files: initial }, "pending", "Searching..."],
    [
      "a failed file search",
      "file",
      { files: failed },
      "failed",
      "Files could not be searched for this project.",
    ],
    [
      "a pull request list not answered",
      "pull-request",
      { list: initial },
      "pending",
      "Searching...",
    ],
    [
      "a failed pull request list",
      "pull-request",
      { list: failed },
      "failed",
      "Pull requests could not be read for this project.",
    ],
    [
      "a list with an error for the project",
      "pull-request",
      { list: listOf([7], ["p"]) },
      "failed",
      "Pull requests could not be read for this project.",
    ],
    [
      "a list with an error for another project",
      "pull-request",
      { list: listOf([7], ["other"]) },
      "ready",
      "No matches.",
    ],
    ["a list with entries", "pull-request", { list: listOf([7]) }, "ready", "No matches."],
    ["an empty list", "pull-request", { list: listOf([]) }, "ready", "No matches."],
    [
      "a project with no repository",
      "pull-request",
      { pullRequestsAvailable: false, list: initial },
      "unavailable",
      "Pull requests are not available for this project.",
    ],
    [
      "a single read not answered",
      "pull-request",
      { list: listOf([7]), detail: initial },
      "pending",
      "Searching...",
    ],
    ["a command word", "command", { files: initial, list: initial }, "ready", "No matches."],
  ] as const)(
    "Given %s, then the status is %s and the empty text is %j",
    (_name, kind, reads, status, text) => {
      const result = resolve(kind, reads);
      expect(result.status).toBe(status);
      expect(emptyText(result.status, kind)).toBe(text);
    },
  );
});

describe("the single pull request read", () => {
  it.each([
    ["a number in the list", "7", [7, 8], null],
    ["a number missing from the list", "250", [7, 8], { repository: "o/r", number: 250 }],
    ["a number against an empty or failed list", "250", [], null],
    ["a text query", "fix", [7, 8], null],
    ["no query", "", [7, 8], null],
  ])("Given %s, then the read is %j", (_name, query, numbers, target) => {
    expect(detailTarget(query, numbers.map(pullRequest))).toEqual(target);
  });

  it("Given a read that answered, then its pull request joins the list, and a failed one adds nothing", () => {
    const answered = resolve("pull-request", {
      list: listOf([7]),
      detail: ready(pullRequest(250)),
    });
    expect(answered.pullRequests.map((entry) => entry.number)).toEqual([7, 250]);
    expect(answered.status).toBe("ready");
    const missed = resolve("pull-request", { list: listOf([7]), detail: failed });
    expect(missed.pullRequests.map((entry) => entry.number)).toEqual([7]);
  });
});
