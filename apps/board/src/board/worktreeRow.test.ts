import { describe, expect, it } from "vite-plus/test";

import type { StorageCleanupReport } from "@t3tools/contracts";
import { worktreeBytes, worktreeKeptReason } from "./worktreeRow";

const entry = (path: string, bytes: number | null): StorageCleanupReport["entries"][number] => ({
  kind: "worktree",
  outcome: "kept",
  reason: "",
  path,
  projectPath: null,
  threadId: null,
  threadTitle: null,
  bytes,
  files: null,
});

const report = (entries: StorageCleanupReport["entries"]): StorageCleanupReport => ({
  trigger: "manual",
  startedAt: "",
  finishedAt: "",
  entries,
  counts: { removed: 0, kept: 0, failed: 0 },
  omittedCount: 0,
  bytesFreed: 0,
});

describe("a worktree's size", () => {
  it.each([
    [
      "the report has the worktree",
      report([entry("/wt/a", 2048), entry("/wt/b", 5)]),
      "/wt/a",
      2048,
    ],
    ["the report has no entry for it", report([entry("/wt/b", 5)]), "/wt/a", null],
    ["there is no report", null, "/wt/a", null],
  ] as const)("Given %s, when the size is read, then it is %s", (_name, given, path, bytes) => {
    expect(worktreeBytes(given, path)).toBe(bytes);
  });
});

describe("whether a ticket's worktree can be cleaned up", () => {
  it.each([
    ["the ticket is not merged", "building", null, "not-merged"],
    ["the last cleanup kept it for its evidence", "merged", "evidence-missing", "evidence-missing"],
    ["it is merged and nothing keeps it", "merged", null, null],
  ] as const)(
    "Given %s, when its reason is read, then it is the one expected",
    (_name, stage, kept, reason) => {
      expect(worktreeKeptReason(stage, kept)).toBe(reason);
    },
  );
});
