import { describe, expect, it } from "vite-plus/test";

import { parseWorktreeList } from "./gitWorktrees";

const record = (...lines: ReadonlyArray<string>) => `${lines.join("\n")}\n\n`;

describe("reading `git worktree list --porcelain`", () => {
  it.each([
    { name: "no output", stdout: "", worktrees: [] },
    {
      name: "the main checkout, a branch worktree and a detached one",
      stdout:
        record("worktree /repo", "HEAD 1111", "branch refs/heads/main") +
        record("worktree /w/a", "HEAD 2222", "branch refs/heads/feat/a") +
        record("worktree /w/b", "HEAD 3333", "detached"),
      worktrees: [
        { path: "/repo", branch: "main", main: true },
        { path: "/w/a", branch: "feat/a", main: false },
        { path: "/w/b", branch: null, main: false },
      ],
    },
    {
      name: "a prunable worktree whose folder is gone",
      stdout:
        record("worktree /repo", "HEAD 1111", "branch refs/heads/main") +
        record(
          "worktree /w/gone",
          "HEAD 2222",
          "detached",
          "prunable gitdir file points to non-existent location",
        ),
      worktrees: [{ path: "/repo", branch: "main", main: true }],
    },
  ])("Given $name, then it lists $worktrees.length", ({ stdout, worktrees }) => {
    expect(parseWorktreeList(stdout)).toEqual(worktrees);
  });
});
