import { describe, expect, it } from "vite-plus/test";

import { parseAdditions } from "../domain/additions";
import { SYSTEM_TEMPLATE } from "../domain/reviewTemplate";
import { orchestratorStats, renderFacts, renderRules } from "./brief";
import { resolveRoles, ROLES } from "./roles";

const FACTS = {
  boardDir: "/p/.agentboard/x",
  builderCap: 2,
  project: "slugkit",
  projectDir: "/p",
  reviewTemplate: SYSTEM_TEMPLATE,
  usage: [],
};

describe("the orchestrator's standing rules and board facts", () => {
  it("Given a board, when the facts render, then they name the folder, the cap, and the project and nothing else", () => {
    const facts = renderFacts(FACTS);
    expect(facts).toContain("`/p/.agentboard/x`");
    expect(facts).toContain("at most 2 builders");
    expect(facts).toContain("`slugkit`, at `/p`");
    expect(facts).not.toContain("{{");
    expect(facts).not.toContain("delegate_task");
  });

  it("Given the standing rules, when they render, then they hold no board's folder, cap, or project", () => {
    const rules = renderRules();
    expect(rules).not.toContain("{{");
    expect(rules).not.toContain("# Board facts");
    expect(rules).toContain("Read <board folder>/roles/<role>.md and act as that role.");
    expect(rules).toContain("`printenv T3CODE_THREAD_ID`");
    expect(rules).toContain("`.agentboard/*/board.json`");
    expect(rules).toContain("`orchestratorThreadId`");
  });

  it("Given the rules, when they render, then they say the app owns ticket-details.json and how its layers and prerequisites apply", () => {
    const rules = renderRules();
    expect(rules).toMatch(/\| `ticket-details.json`\s+\| app\s+\|/);
    expect(rules).toContain("apply its `edits`, then its `pulled`, over the ticket");
    expect(rules).toContain("Never edit `ticket-details.json`");
    expect(rules).toContain("Decide what to start from the `dependsOn` after those layers");
    expect(rules).toContain("never write a `dependsOn` that makes a cycle");
  });

  it("Given the rules, when their additions.json block examples are parsed, then each of the five types is a valid block", () => {
    const examples = [...renderRules().matchAll(/`(\{ "type": .*? \})`/g)].map((match) => match[1]);
    const file = `[${examples
      .map(
        (block, at) =>
          `{"id":"b${at}","title":"t","asOf":"2026-11-23T09:40:00Z","place":"ticket","ticket":"T-1","blocks":[${block}]}`,
      )
      .join(",")}]`;
    const parsed = parseAdditions(file);
    expect([parsed.problems, parsed.items?.map((item) => item.blocks[0]?.type)]).toEqual([
      [],
      ["text", "stat", "list", "table", "link"],
    ]);
  });

  it("Given the registry, when the rules render, then every role is listed with its delegate_task arguments", () => {
    const rules = renderRules();
    expect(rules).toContain(
      '| `scout` | MUST be used for exploratory codebase research, rapid code analysis, and broad pattern searches. | `research` | `shared` | `{"model":"claude-sonnet-5-5","options":{"effort":"medium"}}` | yes |',
    );
    expect(ROLES.filter((role) => !rules.includes(`| \`${role.name}\` |`))).toEqual([]);
  });

  it("Given an instance that lacks a model, when the rules render, then the fallback is stated under the table", () => {
    const roles = resolveRoles(ROLES, {
      instanceId: "claudeAgent",
      offered: ["claude-opus-5-5", "claude-sonnet-5-5"],
    });
    expect(renderRules(roles)).toContain(
      "- claude-haiku-5-5 is not offered by claudeAgent, so it uses the orchestrator's model.",
    );
  });

  it("Given the rules, when they render, then they require the real clock, every stage, a named PR base, and evidence", () => {
    const rules = renderRules();
    expect(rules).toContain("`date -u +%Y-%m-%dT%H:%M:%SZ`");
    expect(rules).toContain("Move a ticket here the moment you open its pull request");
    expect(rules).toContain("Open each pull request against the base the user named.");
    expect(rules).toContain("<its worktree>/.omp/artifacts/<ticket key>/");
    expect(rules).toContain("<board folder>/artifacts/<ticket key>/");
    expect(rules).toContain(
      "Copy every key folder under `<worktree>/.omp/artifacts/`, not only this ticket's",
    );
    expect(rules).toContain("`met`, `evidence`, and `note` are all required");
    expect(rules).toContain("- `todo`: captured, no plan yet.");
    expect(rules).toContain(
      "Before you move a ticket to `planned`, set its `playbook` and `steps`",
    );
    expect(rules).toContain("Start `poteto-agent` for a ticket that crosses several modules");
    expect(rules).toContain("start every bug-fix round whose finding can fail when run");
    expect(rules).toContain("`repro-before-N.txt` for fix round N");
    expect(rules).toContain("Put this in each fix-round send too");
  });

  it("Given the rules, when they render, then they start a sonic local CI run and state its file format", () => {
    const rules = renderRules();
    expect(rules).toContain(
      "start a `sonic` agent to run local CI on its head in the builder's worktree",
    );
    expect(rules).toContain("Line 1 is the head SHA from `git rev-parse HEAD`");
    expect(rules).toContain("each step ends with a line `<step>-exit=<code>`");
    expect(rules).toContain("Reported checks win over the file.");
  });

  it("Given the rules, when they render, then they state each pipeline gate", () => {
    const rules = renderRules();
    expect(rules).toContain(
      "author-check table that lists each author check, ran or skipped, with a proof path",
    );
    expect(rules).toContain("`pre-pr-reviewer` may run inline for a diff of 3 files or fewer");
    expect(rules).toContain(
      "move the ticket to `reviewing` only if its author-check table is complete",
    );
    expect(rules).toContain("update the ticket's `headSha`, `fixRounds`, and stage");
    expect(rules).toContain("Leave `verifying` only with a `verify` verdict in `verdicts`");
    expect(rules).toContain("Record a partial verification as partial.");
    expect(rules).toContain(
      "Post the `merge_approval` card in the turn the pull request's checks or its local CI run finish.",
    );
    expect(rules).toContain("Give each stage move its own decision line");
    expect(rules).toContain("`gh pr create --repo <owner/repo> --base <base>`");
    expect(rules).toContain("Never use T3's `pull_request_create`");
    expect(rules).toContain("Confirm the pull request's repo afterwards.");
    expect(rules).toContain("`gh pr edit --attach`");
    expect(rules).toContain("run `how` and `architect` before it writes code, and `interrogate`");
    expect(rules).toContain("records the skip and its reason in the ticket's steps");
    expect(rules).toContain("T3's built-in browser through its `preview_*` tools");
    expect(rules).toContain("save each screenshot with `preview_snapshot` and `save=true`");
    expect(rules).not.toContain("`preview_*` cannot save files");
    expect(rules).toContain("delete its scratch folders and any token files before it reports");
    expect(rules).toContain(
      "names a concrete input sequence gets a verify check before you decline it",
    );
    expect(rules).toContain("a decline needs evidence that the sequence cannot happen");
    expect(rules).toContain("fixture injected into the page during a check as a P2");
    expect(rules).toContain("branch from `origin/main`, or from the ticket's `base`");
    expect(rules).toContain("matched to a playbook, with `playbook` and `steps` filled");
  });
});

describe("the review template and usage rules", () => {
  it("Given a board, when the facts render, then they name the template and one line per usage window", () => {
    const facts = renderFacts({
      ...FACTS,
      usage: [{ id: "weekly", percent: 82, line: "Claude weekly 82%, resets in 5d" }],
    });
    expect(facts).toContain("- The review template is `Review loop`.");
    expect(facts).toContain("  - Claude weekly 82%, resets in 5d");
  });
});

describe("orchestrator stats", () => {
  const tickets = JSON.stringify([
    { key: "T-1", title: "a", stage: "todo" },
    { key: "T-2", title: "b", stage: "building" },
    { key: "T-3", title: "c", stage: "building" },
    { key: "T-4", title: "d", stage: "reviewing" },
    { key: "T-5", title: "e", stage: "merged" },
  ]);
  const item = (id: string, kind: string, status: string) =>
    JSON.stringify({ id, kind, title: id, body: "", status, createdAt: "2026-11-20T10:00:00Z" });
  const forYou = [
    item("a", "question", "open"),
    item("b", "gate", "open"),
    '{"id":"a","status":"resolved"}',
    item("c", "read", "held"),
  ].join("\n");
  const decisions =
    "time\tdecision\talternatives\treason\tevidence\n2026-11-20\tSplit into five tickets\t-\tindependent\ttickets.json\n2026-11-21\tResearch T-1 first\t-\tunknown area\t-\n";

  it("Given a fixed store, when the stats are counted, then each number matches", () => {
    const stats = orchestratorStats({ tickets, forYou, decisions }, 2);
    expect(stats).toEqual({
      stages: {
        todo: 1,
        planned: 0,
        building: 2,
        reviewing: 1,
        verifying: 0,
        pr: 0,
        awaiting_approval: 0,
        merged: 1,
        off_path: 0,
      },
      ticketTotal: 5,
      forYouOpen: 1,
      builderCap: 2,
      latestDecision: { time: "2026-11-21", decision: "Research T-1 first" },
      problems: [],
    });
  });

  it("Given no store files yet, when the stats are counted, then everything is zero and nothing is a problem", () => {
    const stats = orchestratorStats({ tickets: null, forYou: null, decisions: null }, 2);
    expect(stats.ticketTotal).toBe(0);
    expect(stats.forYouOpen).toBe(0);
    expect(stats.latestDecision).toBeNull();
    expect(stats.problems).toEqual([]);
  });

  it("Given only the decisions header, when the stats are counted, then there is no latest decision", () => {
    const header = "time\tdecision\talternatives\treason\tevidence\n";
    expect(
      orchestratorStats({ tickets: null, forYou: null, decisions: header }, 2).latestDecision,
    ).toBeNull();
  });

  it("Given a bad stage and a bad for-you line, when the stats are counted, then the stage is reported and the good lines count", () => {
    const stats = orchestratorStats(
      {
        tickets: '[{"key":"T-1","title":"a","stage":"done"}]',
        forYou: `${item("a", "question", "open")}\n\nnot json\n`,
        decisions: null,
      },
      2,
    );
    expect(stats.problems).toEqual([expect.stringContaining("tickets.json is invalid: ")]);
    expect(stats.forYouOpen).toBe(1);
    expect(stats.ticketTotal).toBe(0);
  });
});
