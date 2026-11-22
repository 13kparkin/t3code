import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useState } from "react";

import { projectEnvironment } from "../state/projects";
import { pullRequestEnvironment } from "../state/prStatus";
import type { PullRequestLine, SlashTrigger } from "./slash";

const DEBOUNCE_MS = 120;
const FILE_LIMIT = 80;
const PULL_REQUEST_LIMIT = 99;
const NONE = [] as const;

const idle = Atom.make(AsyncResult.initial<never, never>()).pipe(
  Atom.withLabel("board:trigger-lookup:idle"),
);

function useDebounced<A>(value: A) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

/**
 * What the engine finds for an `@` or `#` word, the way T3's composer asks: a file search in the
 * project folder, and the project's most recent pull requests plus, for a number outside them, a
 * read of that one pull request. Reads stay idle until the word has stopped changing, and for any
 * other kind of trigger. `status` is pending until the reads for the word have answered.
 */
export function useTriggerLookup(project: EnvironmentProject, trigger: SlashTrigger | null) {
  const query = trigger?.query ?? "";
  const settled = useDebounced(query);
  const ready = settled === query;
  const { environmentId, workspaceRoot: cwd } = project;

  const files = useAtomValue(
    trigger?.kind === "file" && ready
      ? projectEnvironment.searchEntries({
          environmentId,
          input: { cwd, query: settled.slice(0, 256), limit: FILE_LIMIT },
        })
      : idle,
  );
  const list = useAtomValue(
    trigger?.kind === "pull-request" && ready
      ? pullRequestEnvironment.list({
          environmentId,
          input: {
            state: "all",
            projectId: project.id,
            limit: PULL_REQUEST_LIMIT,
            ...(/^\d*$/.test(settled) ? {} : { query: settled }),
          },
        })
      : idle,
  );
  const listed = AsyncResult.getOrElse(list, () => null);
  const recent = listed?.entries ?? NONE;
  const repository = recent[0]?.repository;
  const number = /^\d+$/.test(settled) ? Number(settled) : null;
  const needsDetail =
    number !== null &&
    Number.isSafeInteger(number) &&
    number > 0 &&
    repository !== undefined &&
    !recent.some((entry) => entry.number === number);
  const detail = useAtomValue(
    needsDetail
      ? pullRequestEnvironment.detail({
          environmentId,
          input: { projectId: project.id, repository, number },
        })
      : idle,
  );
  const exact = AsyncResult.getOrElse(detail, () => null);

  const status = ((): "ready" | "pending" | "failed" => {
    if (trigger?.kind === "file") {
      if (AsyncResult.isInitial(files)) return "pending";
      return AsyncResult.isFailure(files) ? "failed" : "ready";
    }
    if (trigger?.kind === "pull-request") {
      if (AsyncResult.isInitial(list) || (needsDetail && AsyncResult.isInitial(detail))) {
        return "pending";
      }
      const failed =
        AsyncResult.isFailure(list) || listed?.errors.some((e) => e.projectId === project.id);
      return failed ? "failed" : "ready";
    }
    return "ready";
  })();

  const pullRequests: ReadonlyArray<PullRequestLine> = exact === null ? recent : [...recent, exact];
  return {
    files: AsyncResult.getOrElse(files, () => null)?.entries ?? NONE,
    pullRequests,
    status,
  };
}
