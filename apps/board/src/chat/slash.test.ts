import { ServerProviderSkill, ServerProviderSlashCommand } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSlashItems,
  detectSlashTrigger,
  rankSlashItems,
  replaceTrigger,
  slashMessage,
} from "./slash";

const command = Schema.decodeUnknownSync(ServerProviderSlashCommand);
const skill = Schema.decodeUnknownSync(ServerProviderSkill);

const commands = [
  command({ name: "compact", input: { hint: "optional summary instructions" } }),
  command({ name: "code-review", description: "Review a pull request" }),
  command({ name: "debug", description: "Find the cause of an issue" }),
  command({ name: "review", description: "Review the current branch" }),
  command({ name: "egm-review", description: "Run the document review" }),
  command({ name: "security-audit" }),
];

const skills = [
  skill({ name: "review-agent", path: "/s/review-agent", enabled: true, scope: "user" }),
  skill({
    name: "pr-description",
    path: "/s/pr-description",
    enabled: true,
    description: "Draft the review text for a pull request",
  }),
  skill({ name: "security-audit", path: "/s/security-audit", enabled: true }),
  skill({ name: "hidden-skill", path: "/s/hidden", enabled: false }),
  skill({ name: "agent-only", path: "/s/agent-only", enabled: true, userInvocable: false }),
];

const items = buildSlashItems({
  commands,
  skills,
  actions: ["model", "clear"],
  messageIsOnlyTheCommand: true,
});

const labels = (query: string) => rankSlashItems(items, query).map((item) => item.label);

describe("the slash menu's items", () => {
  it("Given a skill that shares a command's name and skills that cannot be invoked, when the items are built, then the command and those skills are left out", () => {
    expect(items.map((item) => item.id)).toEqual([
      "command:compact",
      "command:code-review",
      "command:debug",
      "command:review",
      "command:egm-review",
      "skill:review-agent",
      "skill:pr-description",
      "skill:security-audit",
      "action:model",
      "action:clear",
    ]);
  });

  it("Given text after the command, when the items are built, then /compact is not offered", () => {
    const rest = buildSlashItems({
      commands,
      skills: [],
      actions: [],
      messageIsOnlyTheCommand: false,
    });
    expect(rest.map((item) => item.label)).not.toContain("/compact");
  });

  it("Given T3's /clear and /model are offered, when the items are built, then the provider's own versions are left out", () => {
    const built = buildSlashItems({
      commands: [command({ name: "clear" }), command({ name: "model" }), command({ name: "init" })],
      skills: [],
      actions: ["model", "clear"],
      messageIsOnlyTheCommand: true,
    });
    expect(built.map((item) => [item.group, item.label])).toEqual([
      ["command", "/init"],
      ["action", "/model"],
      ["action", "/clear"],
    ]);
  });
});

describe("ranking the slash menu", () => {
  it("Given the input /, when the items are ranked, then all of them are listed as commands, skills, and T3 actions in the engine's order", () => {
    expect(labels("/".slice(1))).toEqual([
      "/compact",
      "/code-review",
      "/debug",
      "/review",
      "/egm-review",
      "$review-agent",
      "$pr-description",
      "$security-audit",
      "/model",
      "/clear",
    ]);
  });

  it("Given the input /re, when the items are ranked, then prefix matches lead word matches, and each is grouped as commands, skills, and T3 actions", () => {
    expect(labels("/re".slice(1))).toEqual([
      "/review",
      "$review-agent",
      "/code-review",
      "/egm-review",
      "$pr-description",
      "/model",
    ]);
  });

  it("Given the input /rev, when the items are ranked, then the same items stay and nothing else joins them", () => {
    expect(labels("/rev".slice(1))).toEqual([
      "/review",
      "$review-agent",
      "/code-review",
      "/egm-review",
      "$pr-description",
    ]);
  });

  it("Given the input /mod, when the items are ranked, then the T3 action that starts with it leads a command that only mentions it", () => {
    const withModel = rankSlashItems(
      buildSlashItems({
        commands: [command({ name: "update-config", description: "Change the model" })],
        skills: [],
        actions: ["model"],
        messageIsOnlyTheCommand: true,
      }),
      "mod",
    );
    expect(withModel.map((item) => item.label)).toEqual(["/model", "/update-config"]);
  });

  it("Given a query with no match, when the items are ranked, then nothing stays", () => {
    expect(labels("zzz")).toEqual([]);
  });
});

describe("the trigger at the cursor", () => {
  it.each([
    ["Run /tmp/build.sh", "Run /tmp/build.sh".length],
    ["/etc/hosts", "/etc/hosts".length],
    ["Use /etc/hosts now", "Use /et".length],
    ["Use/review", "Use/review".length],
    ["https://example.com/review", "https://example.com/review".length],
    ["Use /review ", "Use /review ".length],
    ["/model spark", "/model spark".length],
    ["", 0],
  ])("Given %j with the cursor at %i, then no menu opens", (text, cursor) => {
    expect(detectSlashTrigger(text, cursor)).toBeNull();
  });

  it.each(["", "Use ", "Use\t", "Use\n  "])(
    "Given /skill:review after %j, then it opens the command menu on that word",
    (prefix) => {
      const text = `${prefix}/skill:review later`;
      const cursor = `${prefix}/skill:review`.length;
      expect(detectSlashTrigger(text, cursor)).toEqual({
        kind: "command",
        query: "skill:review",
        rangeStart: prefix.length,
        rangeEnd: cursor,
      });
    },
  );

  it.each([
    "It costs $5",
    "budget $9.99",
    "only $.99",
    "about €20",
    "raise $10k",
    "raise $10k.",
    "is it $5?",
  ])("Given the amount in %j, then no skill menu opens", (text) =>
    expect(detectSlashTrigger(text, text.length)).toBeNull(),
  );

  it("Given a $ word mid-message, then the skill menu opens on it", () => {
    expect(detectSlashTrigger("Please use $rev now", "Please use $rev".length)).toEqual({
      kind: "skill",
      query: "rev",
      rangeStart: "Please use ".length,
      rangeEnd: "Please use $rev".length,
    });
    expect(detectSlashTrigger("$", 1)).toEqual({
      kind: "skill",
      query: "",
      rangeStart: 0,
      rangeEnd: 1,
    });
  });

  it.each(["Compare this with #8737", "see @src/index.ts", "# Heading", "issue#123", "mail a@b"])(
    "Given %j, then no menu opens, since the board has no file or pull request list",
    (text) => expect(detectSlashTrigger(text, text.length)).toBeNull(),
  );
});

describe("a pick replaces the typed word", () => {
  it("Given a / word mid-message, then the pick takes its place and the rest stays", () => {
    const text = "Please run /rev on this";
    const trigger = detectSlashTrigger(text, "Please run /rev".length);
    if (trigger === null) throw new Error("no trigger");
    expect(replaceTrigger(text, trigger, "$review-agent ")).toEqual({
      text: "Please run $review-agent on this",
      cursor: "Please run $review-agent ".length,
    });
  });

  it("Given a $ word at the end, then the pick keeps the text before it", () => {
    const text = "Use $rev";
    const trigger = detectSlashTrigger(text, text.length);
    if (trigger === null) throw new Error("no trigger");
    expect(replaceTrigger(text, trigger, "$review-agent ")).toEqual({
      text: "Use $review-agent ",
      cursor: "Use $review-agent ".length,
    });
  });
});

describe("the message a picked item sends", () => {
  const pick = (id: string) => {
    const found = items.find((item) => item.id === id);
    if (found === undefined) throw new Error(id);
    return found;
  };

  it("Given a command and an argument, when it is turned into a message, then the argument follows the command", () => {
    expect(slashMessage(pick("command:compact"), "keep the ticket list")).toBe(
      "/compact keep the ticket list",
    );
  });

  it("Given a command with no argument, when it is turned into a message, then it is the command alone", () => {
    expect(slashMessage(pick("command:debug"), "  ")).toBe("/debug");
  });

  it("Given a skill and an argument, when it is turned into a message, then it is the $ mention, which the engine turns into the provider's own form", () => {
    expect(slashMessage(pick("skill:review-agent"), "the last commit")).toBe(
      "$review-agent the last commit",
    );
  });

  it("Given a T3 action, when it is turned into a message, then nothing is sent", () => {
    expect(slashMessage(pick("action:model"), "")).toBe("");
  });
});
