import { ThreadId, TurnItemId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { lastDelegateFailure } from "./projectionSource";

const call = (
  position: number,
  status: OrchestrationV2TurnItem["status"],
  text: string | null,
  toolName = "mcp__t3-code__delegate_task",
) => ({
  position,
  visibility: "local" as const,
  sourceThreadId: ThreadId.make("thread"),
  sourceItemId: TurnItemId.make(`item-${position}`),
  item: {
    id: TurnItemId.make(`item-${position}`),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: position,
    status,
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe("2026-11-28T00:00:00Z"),
    type: "dynamic_tool",
    toolName,
    input: {},
    output: text === null ? null : { content: [{ type: "text", text }] },
  } satisfies OrchestrationV2TurnItem,
});

describe("the orchestrator's last delegate failure", () => {
  it.each([
    ["no delegate call", [call(1, "failed", "boom", "mcp__t3-code__other")], null],
    [
      "a failed call",
      [call(1, "failed", "Provider codex cannot start children.\nmore")],
      "Provider codex cannot start children.",
    ],
    ["a failed call with no text", [call(1, "failed", null)], "The engine gave no reason."],
    [
      "a failure then a call that went through",
      [call(1, "failed", "boom"), call(2, "completed", "ok")],
      null,
    ],
    [
      "a failure then one still running",
      [call(1, "failed", "boom"), call(2, "running", null)],
      "boom",
    ],
  ])("Given %s, then the card shows %j", (_name, items, expected) => {
    expect(lastDelegateFailure({ visibleTurnItems: items })).toBe(expected);
  });
});
