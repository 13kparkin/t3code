import { describe, expect, it } from "vite-plus/test";

import type { AgentView, RunState } from "../state/boardModel";
import { newestAgent, ticketStatus } from "./ticketStatus";

const agent = (
  threadId: string,
  runState: RunState,
  extra: Partial<AgentView> = {},
): AgentView => ({
  threadId,
  title: threadId,
  role: "builder",
  registered: true,
  outsideRegistry: false,
  ticketKey: null,
  driver: null,
  runState,
  pendingRequest: false,
  branch: null,
  parentThreadId: null,
  round: null,
  updatedAt: "2026-11-20T10:00:00.000Z",
  ...extra,
});

const LATER = "2026-11-21T10:00:00.000Z";

describe("a card's status", () => {
  it.each([
    [[], null],
    [[agent("a", "idle"), agent("b", "stopped")], "Idle"],
    [[agent("a", "idle"), agent("b", "working")], "Working"],
    [[agent("a", "idle"), agent("b", "waiting")], "Working"],
    [[agent("a", "working"), agent("b", "failed")], "Working"],
    [[agent("a", "failed"), agent("b", "idle", { updatedAt: LATER })], "Idle"],
    [[agent("a", "idle"), agent("b", "failed", { updatedAt: LATER })], "Failed"],
    [[agent("a", "failed"), agent("b", "idle", { pendingRequest: true })], "Waiting on you"],
  ])(
    "Given agents %#, when read, then a live state wins, else the newest agent's",
    (agents, word) => {
      expect(ticketStatus(agents)?.word ?? null).toBe(word);
    },
  );

  it("Given agents updated at different times, when read, then the newest is named", () => {
    const later = agent("b", "idle", { updatedAt: "2026-11-21T10:00:00.000Z" });
    expect(newestAgent([agent("a", "idle"), later, agent("c", "idle")])).toBe(later);
    expect(newestAgent([])).toBeUndefined();
  });
});
