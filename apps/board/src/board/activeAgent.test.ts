import { describe, expect, it } from "vite-plus/test";

import type { AgentView } from "../state/boardModel";
import { activeAgentOf } from "./activeAgent";

const agent = (threadId: string, runState: AgentView["runState"], updatedAt: string) =>
  ({ threadId, runState, updatedAt }) as AgentView;

describe("a ticket's active agent", () => {
  it.each([
    [
      "a live agent wins over a newer finished one",
      [agent("a", "working", "1"), agent("b", "idle", "2")],
      "a",
    ],
    [
      "the newest of two live agents wins",
      [agent("a", "working", "1"), agent("b", "waiting", "2")],
      "b",
    ],
    ["finished agents only gives none", [agent("a", "idle", "1"), agent("b", "failed", "2")], null],
    ["no agents gives none", [], null],
  ] as const)("Given %s, when it is read, then the result is %s", (_name, agents, expected) => {
    expect(activeAgentOf(agents)?.threadId ?? null).toBe(expected);
  });
});
