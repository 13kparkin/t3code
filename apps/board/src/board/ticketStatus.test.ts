import { describe, expect, it } from "vite-plus/test";

import type { AgentView, RunState } from "../state/boardModel";
import { newestAgent, shouldAutoStop, ticketStatus } from "./ticketStatus";

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
  waitingOnChildren: false,
  latestRunId: null,
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
    [[agent("a", "idle"), agent("b", "stopped")], "Stopped"],
    [[agent("a", "idle"), agent("b", "working")], "Working"],
    [[agent("a", "idle"), agent("b", "waiting")], "Working"],
    [[agent("a", "working"), agent("b", "failed")], "Working"],
    [[agent("a", "failed"), agent("b", "idle", { updatedAt: LATER })], "Stopped"],
    [[agent("a", "idle"), agent("b", "failed", { updatedAt: LATER })], "Failed"],
    [[agent("a", "failed"), agent("b", "idle", { pendingRequest: true })], "Waiting on you"],
  ])(
    "Given agents %#, when read, then a live state wins, else the newest agent's",
    (agents, word) => {
      expect(ticketStatus(agents, 0)?.word ?? null).toBe(word);
    },
  );

  it("Given agents updated at different times, when read, then the newest is named", () => {
    const later = agent("b", "idle", { updatedAt: "2026-11-21T10:00:00.000Z" });
    expect(newestAgent([agent("a", "idle"), later, agent("c", "idle")])).toBe(later);
    expect(newestAgent([])).toBeUndefined();
  });
});

describe("which agents the board stops", () => {
  const now = Date.parse("2026-11-20T10:10:00.000Z");
  const ran = { latestRunId: "run-1", updatedAt: "2026-11-20T10:09:00.000Z" };
  it.each([
    { name: "a finished run", agent: agent("a", "idle", ran), stop: true },
    { name: "a failed run", agent: agent("a", "failed", ran), stop: true },
    { name: "the orchestrator", agent: agent("orch", "idle", ran), stop: false },
    { name: "a working run", agent: agent("a", "working", ran), stop: false },
    {
      name: "a question",
      agent: agent("a", "idle", { ...ran, pendingRequest: true }),
      stop: false,
    },
    {
      name: "children",
      agent: agent("a", "idle", { ...ran, waitingOnChildren: true }),
      stop: false,
    },
    { name: "no run yet", agent: agent("a", "idle"), stop: false },
    {
      name: "a run the engine already released",
      agent: agent("a", "idle", { latestRunId: "run-1", updatedAt: "2026-11-20T09:30:00.000Z" }),
      stop: false,
    },
  ])("Given $name, then stop is $stop", ({ agent: subject, stop }) => {
    expect(shouldAutoStop(subject, "orch", now)).toBe(stop);
  });
});
