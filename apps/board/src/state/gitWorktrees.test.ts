import { describe, expect, it } from "vite-plus/test";

import { parseWorktreeList, worktreesOnDisk } from "./gitWorktrees";

const record = (...fields: ReadonlyArray<string>) => `${fields.join("\0")}\0\0`;

describe("reading `git worktree list --porcelain -z`", () => {
  it.each([
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
    {
      name: "a path with a newline that reads like a second record",
      stdout:
        record("worktree /repo", "HEAD 1111", "branch refs/heads/main") +
        record("worktree /w/a\n\nworktree /forged\nprunable", "HEAD 2222", "detached"),
      worktrees: [
        { path: "/repo", branch: "main", main: true },
        { path: "/w/a\n\nworktree /forged\nprunable", branch: null, main: false },
      ],
    },
  ])("Given $name, then it lists $worktrees.length", ({ stdout, worktrees }) => {
    expect(parseWorktreeList(stdout)).toEqual(worktrees);
  });

  it("Given the main checkout, a branch worktree and a detached one, when mapped, then each worktree but the main one maps to git's branch", () => {
    expect(
      worktreesOnDisk([
        { path: "/repo", branch: "main", main: true },
        { path: "/w/a", branch: "feat/a", main: false },
        { path: "/w/b", branch: null, main: false },
      ]),
    ).toEqual(
      new Map([
        ["/w/a", "feat/a"],
        ["/w/b", null],
      ]),
    );
  });
});
