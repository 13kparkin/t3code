import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ForYouItem, type TrackerWrite, type TrackerWriteItem } from "../domain/forYou";
import { parseTickets } from "../domain/ticket";
import {
  describeTrackerWrite,
  classifyIssueLink,
  findIssueKeys,
  ticketIssueRef,
  type TicketIssueContext,
  trackerCall,
} from "./issueLinks";

const CONTEXT: TicketIssueContext = {
  projectId: "project-1",
  githubScope: "13kparkin/agent-board-lanes",
};

const TICKETS = JSON.stringify([
  { key: "T-2", title: "No tracker", stage: "planned" },
  { key: "T-3", title: "Named", stage: "pr", issue: { tracker: "linear", key: "XEO-3332" } },
  { key: "T-4", title: "On GitHub", stage: "planned", issue: { tracker: "github", key: "#7" } },
  {
    key: "T-5",
    title: "Other repo",
    stage: "planned",
    issue: { tracker: "github", key: "acme/tools#12" },
  },
]);

const decodeForYou = Schema.decodeUnknownResult(ForYouItem);

const writeItem = (write: TrackerWrite): TrackerWriteItem => ({
  id: "tw-1",
  kind: "tracker_write",
  title: "Change an issue",
  body: "",
  status: "open",
  createdAt: "2026-11-21T10:00:00Z",
  write,
});

describe("finding issue keys in text", () => {
  it("Given text with Linear and GitHub keys, when searched, then each key is found once in order", () => {
    const text = "Fixes XEO-3330 and follows up acme/tools#12.";
    expect(findIssueKeys(text)).toEqual([
      { tracker: "linear", key: "XEO-3330" },
      { tracker: "github", key: "acme/tools#12" },
    ]);
  });
});

describe("joining tickets to issues", () => {
  const parsed = parseTickets(TICKETS);
  const tickets = Result.isSuccess(parsed) ? parsed.success : [];
  const refOf = (key: string) => {
    const ticket = tickets.find((entry) => entry.key === key);
    if (ticket === undefined) throw new Error(`no ticket ${key}`);
    return ticketIssueRef(ticket, CONTEXT);
  };

  it("Given a ticket that names its issue, when joined, then it reads that Linear issue", () => {
    expect(refOf("T-3")).toEqual({
      projectId: "project-1",
      tracker: "linear",
      host: "linear.app",
      scope: "XEO",
      key: "XEO-3332",
    });
  });

  it("Given GitHub keys, when joined, then a bare number reads the project's repository and a full key its own", () => {
    expect(refOf("T-4")).toEqual({
      projectId: "project-1",
      tracker: "github",
      scope: "13kparkin/agent-board-lanes",
      key: "7",
    });
    expect(refOf("T-5")).toEqual({
      projectId: "project-1",
      tracker: "github",
      scope: "acme/tools",
      key: "12",
    });
  });

  it("Given a ticket with no issue field, when joined, then it has no issue", () => {
    expect(refOf("T-2")).toBeNull();
  });
});

describe("approved tracker writes", () => {
  it("Given an approved create item, when turned into a call, then it is the exact issues.create input", () => {
    const item = writeItem({
      action: "create",
      tracker: "github",
      scope: "13kparkin/agent-board-lanes",
      title: "Cache the list",
      body: "It is slow.",
    });
    expect(trackerCall(item.write, "project-1")).toEqual({
      operation: "create",
      input: {
        projectId: "project-1",
        tracker: "github",
        scope: "13kparkin/agent-board-lanes",
        title: "Cache the list",
        body: "It is slow.",
        labels: [],
        assignees: [],
      },
    });
  });

  it("Given an approved state item, when turned into a call, then it is the exact issues.setState input", () => {
    const item = writeItem({
      action: "set_state",
      tracker: "linear",
      scope: "XEO",
      key: "XEO-3331",
      state: "In Review",
    });
    expect(trackerCall(item.write, "project-1")).toEqual({
      operation: "setState",
      input: {
        projectId: "project-1",
        tracker: "linear",
        scope: "XEO",
        key: "XEO-3331",
        state: "In Review",
      },
    });
  });

  it("Given an approved comment item on a GitHub issue, when turned into a call, then the key loses its hash", () => {
    const item = writeItem({
      action: "comment",
      tracker: "github",
      scope: "13kparkin/agent-board-lanes",
      key: "#7",
      body: "Fixed in the PR.",
    });
    expect(trackerCall(item.write, "project-1")).toEqual({
      operation: "comment",
      input: {
        projectId: "project-1",
        tracker: "github",
        scope: "13kparkin/agent-board-lanes",
        key: "7",
        body: "Fixed in the PR.",
      },
    });
  });

  it("Given each write, when described, then the card names the exact change", () => {
    expect(
      describeTrackerWrite(
        writeItem({ action: "set_state", tracker: "github", scope: "a/b", key: "7", state: "Done" })
          .write,
      ),
    ).toBe('Move 7 in a/b on github to "Done"');
  });

  it("Given an item whose write has no action, when decoded, then it is rejected", () => {
    const decoded = decodeForYou({
      ...writeItem({ action: "comment", tracker: "github", scope: "a/b", key: "7", body: "x" }),
      write: { tracker: "github", scope: "a/b" },
    });
    expect(Result.isFailure(decoded)).toBe(true);
  });
});

describe("link text typed on a ticket", () => {
  it.each([
    ["XEO-3331", { tracker: "linear", key: "XEO-3331" }],
    ["acme/tools#12", { tracker: "github", key: "acme/tools#12" }],
    ["#7", { tracker: "github", key: "#7" }],
    ["https://linear.app/xeo/issue/XEO-12/some-slug", { tracker: "linear", key: "XEO-12" }],
    ["https://github.com/acme/tools/issues/5", { tracker: "github", key: "acme/tools#5" }],
    ["  https://example.com/a  ", { tracker: "url", key: "https://example.com/a" }],
    ["not a link", null],
    ["javascript:alert(1)", null],
  ])("Given %j, when classified, then it is %j", (text, issue) => {
    expect(classifyIssueLink(text)).toEqual(issue);
  });
});
