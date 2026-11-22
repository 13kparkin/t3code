import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useState } from "react";

import { projectEnvironment } from "../state/projects";
import { pullRequestEnvironment } from "../state/prStatus";
import type { SlashTrigger } from "./slash";

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
 * project folder, and the project's pull requests, which the menu filters by number. Both stay
 * idle until the word has stopped changing, and for any other kind of trigger.
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
  const pullRequests = useAtomValue(
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
  return {
    files: AsyncResult.getOrElse(files, () => null)?.entries ?? NONE,
    pullRequests: AsyncResult.getOrElse(pullRequests, () => null)?.entries ?? NONE,
  };
}
