import { describe, expect, it } from "vite-plus/test";

import type { Ticket } from "../domain/ticket";
import { applyOverlay } from "../domain/ticketOverlay";
import { agentFile, cardFile, cardMarkdown } from "./cardAttachment";

const ticket: Ticket = {
  key: "T-42",
  title: "Old title",
  stage: "building",
  branch: "feat/login-redirect",
  pr: 123,
  dependsOn: ["T-40"],
  summary: "Send people back to the page they asked for.",
  why: "Login drops the return path.",
  description: "Old description",
};

describe("cardFile", () => {
  it("writes a ticket with its edits applied as a Markdown file", async () => {
    const [edited] = applyOverlay([ticket], {
      "T-42": {
        edits: {
          title: "Fix the login redirect!",
          description: "Keep `next` through the OAuth round trip.",
          dependsOn: ["T-40", "T-41"],
        },
      },
    });
    if (edited === undefined) throw new Error("applyOverlay dropped the ticket");
    const markdown = [
      "# T-42 Fix the login redirect!",
      "",
      "- Stage: Building",
      "- Branch: `feat/login-redirect`",
      "- Pull request: 123",
      "- Depends on: T-40, T-41",
      "",
      "## Summary",
      "",
      "Send people back to the page they asked for.",
      "",
      "## Why",
      "",
      "Login drops the return path.",
      "",
      "## Description",
      "",
      "Keep `next` through the OAuth round trip.",
      "",
    ].join("\n");

    expect(cardMarkdown(edited)).toBe(markdown);
    const file = cardFile(edited);
    expect([file.name, file.type, await file.text()]).toEqual([
      "T-42-fix-the-login-redirect.md",
      "text/markdown",
      markdown,
    ]);
  });

  it("names an agent's file by its thread, and a free agent by its label", async () => {
    const file = agentFile({
      threadId: "thread-0123456789abcdef",
      title: "Research the redirect",
      role: "scout",
      ticketKey: null,
    });
    expect([file.name, await file.text()]).toEqual([
      "agent-89abcdef.md",
      "# Research the redirect\n\n- Agent thread: `thread-0123456789abcdef`\n- Role: scout\n",
    ]);
    expect(await agentFile({ threadId: "thread-0123456789abcdef" }).text()).toBe(
      "# Agent 89abcdef\n\n- Agent thread: `thread-0123456789abcdef`\n",
    );
  });
});
