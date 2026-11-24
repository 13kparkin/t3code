import { describe, expect, it } from "vite-plus/test";

import type { StorageCleanupReport } from "@t3tools/contracts";
import { worktreeBytes } from "./worktreeRow";

const entry = (path: string, bytes: number | null, kind = "worktree") =>
  ({
    kind,
    outcome: "kept",
    reason: "",
    path,
    projectPath: null,
    threadId: null,
    threadTitle: null,
    bytes,
    files: null,
  }) as StorageCleanupReport["entries"][number];

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
    ["the entry has no byte count", report([entry("/wt/a", null)]), "/wt/a", null],
    ["the entry is not a worktree", report([entry("/wt/a", 9, "logs")]), "/wt/a", null],
    ["there is no report", null, "/wt/a", null],
  ] as const)("Given %s, when the size is read, then it is %s", (_name, given, path, bytes) => {
    expect(worktreeBytes(given, path)).toBe(bytes);
  });
});
