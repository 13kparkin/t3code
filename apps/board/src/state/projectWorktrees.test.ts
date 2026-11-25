import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { worktreesByProject } from "./projectWorktrees";

type Thread = Parameters<typeof worktreesByProject>[0][number];

const lineage = (parent: string, extra: Partial<Thread["lineage"]> = {}): Thread["lineage"] => ({
  parentThreadId: ThreadId.make(parent),
  relationshipToParent: "subagent",
  rootThreadId: ThreadId.make("orch"),
  ...extra,
});

const thread = (id: string, extra: Partial<Thread> = {}): Thread => ({
  id: ThreadId.make(id),
  projectId: ProjectId.make("p"),
  title: id,
  branch: null,
  worktreePath: null,
  deletedAt: null,
  lineage: lineage("orch"),
  ...extra,
});

describe("the worktrees a project's threads use", () => {
  it.each([
    {
      name: "a sub-agent thread's worktree",
      threads: [thread("[T-1] task", { worktreePath: "/w/a", branch: "feat/a" })],
      worktrees: [{ path: "/w/a", branch: "feat/a", title: "[T-1] task" }],
    },
    {
      name: "a reviewer sharing the task thread's worktree, listed after it",
      threads: [
        thread("[T-1] reviewer", { worktreePath: "/w/a", lineage: lineage("[T-1] task") }),
        thread("[T-1] task", { worktreePath: "/w/a" }),
      ],
      worktrees: [{ path: "/w/a", branch: null, title: "[T-1] task" }],
    },
    {
      name: "a side chat and a deleted thread",
      threads: [
        thread("side", {
          worktreePath: "/w/b",
          lineage: lineage("orch", { relationshipToParent: null, sideChat: true }),
        }),
        thread("gone", { worktreePath: "/w/c", deletedAt: DateTime.makeUnsafe(0) }),
        thread("no worktree"),
      ],
      worktrees: undefined,
    },
  ])("Given $name, then the project lists $worktrees", ({ threads, worktrees }) => {
    expect(worktreesByProject(threads).get("p")).toEqual(worktrees);
  });
});
