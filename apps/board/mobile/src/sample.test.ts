import { parseTickets } from "@agent-board/app/domain/ticket";
import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import { summarize } from "./boardSummary";
import sample from "./sample-tickets.json";

describe("sample tickets", () => {
  it("parses through the shared domain and counts by stage", () => {
    const tickets = Result.getOrThrow(parseTickets(JSON.stringify(sample)));
    const summary = summarize(tickets);
    expect({ total: summary.total, inProgress: summary.inProgress }).toEqual({
      total: 5,
      inProgress: 2,
    });
    expect([...summary.byStage]).toEqual([
      ["todo", 1],
      ["planned", 1],
      ["building", 1],
      ["reviewing", 1],
      ["verifying", 0],
      ["pr", 0],
      ["awaiting_approval", 0],
      ["merged", 1],
      ["off_path", 0],
    ]);
  });
});
