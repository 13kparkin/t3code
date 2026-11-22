import type { ProjectEntry } from "@t3tools/contracts";

import type { PullRequestLine, SlashTrigger } from "./slash";

/** An engine read as the menu sees it: not answered yet, failed, or answered with a value. */
export type Read<A> =
  | { readonly state: "initial" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly value: A };

export type LookupStatus = "ready" | "pending" | "failed";

type ListedPullRequest = PullRequestLine & { readonly repository: string };

/**
 * The pull request to read on its own, when the word is a number that the most recent pull
 * requests do not hold. The repository comes from those, so an empty or failed list reads nothing.
 */
export function detailTarget(query: string, recent: ReadonlyArray<ListedPullRequest>) {
  if (!/^\d+$/.test(query)) return null;
  const number = Number(query);
  const repository = recent[0]?.repository;
  return Number.isSafeInteger(number) &&
    number > 0 &&
    repository !== undefined &&
    !recent.some((entry) => entry.number === number)
    ? { repository, number }
    : null;
}

/** What the menu gets for a trigger from the reads that answered. `detail` is null when no single read was asked for. */
export function resolveLookup(input: {
  readonly kind: SlashTrigger["kind"] | undefined;
  readonly projectId: string;
  readonly files: Read<{ readonly entries: ReadonlyArray<ProjectEntry> }>;
  readonly list: Read<{
    readonly entries: ReadonlyArray<ListedPullRequest>;
    readonly errors: ReadonlyArray<{ readonly projectId: string }>;
  }>;
  readonly detail: Read<PullRequestLine> | null;
}) {
  const { files, list, detail } = input;
  const recent = list.state === "ready" ? list.value.entries : [];
  const pullRequests: ReadonlyArray<PullRequestLine> =
    detail?.state === "ready" ? [...recent, detail.value] : recent;
  const status = ((): LookupStatus => {
    if (input.kind === "file") {
      return files.state === "ready" ? "ready" : files.state === "failed" ? "failed" : "pending";
    }
    if (input.kind === "pull-request") {
      if (list.state === "initial" || detail?.state === "initial") return "pending";
      const failed =
        list.state === "failed" || list.value.errors.some((e) => e.projectId === input.projectId);
      return failed ? "failed" : "ready";
    }
    return "ready";
  })();
  return {
    files: files.state === "ready" ? files.value.entries : [],
    pullRequests,
    status,
  };
}

/** What the menu says when it lists nothing. */
export function emptyText(status: LookupStatus, kind: SlashTrigger["kind"] | undefined) {
  if (status === "pending") return "Searching...";
  if (status === "failed") {
    return kind === "pull-request"
      ? "Pull requests could not be read for this project."
      : "Files could not be searched for this project.";
  }
  return "No matches.";
}
