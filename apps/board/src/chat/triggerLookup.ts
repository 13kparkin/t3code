import { useAtomValue } from "@effect/atom-react";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useState } from "react";

import { projectEnvironment } from "../state/projects";
import { pullRequestEnvironment } from "../state/prStatus";
import type { SlashTrigger } from "./slash";
import { detailTarget, type Read, resolveLookup } from "./triggerLookup.logic";

const DEBOUNCE_MS = 120;
const FILE_LIMIT = 80;
const PULL_REQUEST_LIMIT = 99;

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

function toRead<A>(result: AsyncResult.AsyncResult<A, unknown>): Read<A> {
  const value = AsyncResult.getOrElse(result, () => null);
  if (value !== null) return { state: "ready", value };
  return AsyncResult.isFailure(result) ? { state: "failed" } : { state: "initial" };
}

/**
 * What the engine finds for an `@` or `#` word, the way T3's composer asks: a file search in the
 * project folder, and the project's most recent pull requests plus, for a number outside them, a
 * read of that one pull request. Reads stay idle until the word has stopped changing, except a
 * pull request number, which is read as it is typed. Any other kind of trigger reads nothing.
 */
export function useTriggerLookup(project: EnvironmentProject, trigger: SlashTrigger | null) {
  const query = trigger?.query ?? "";
  const settled = useDebounced(query);
  const immediate = trigger?.kind === "pull-request" && /^\d*$/.test(query);
  const word = immediate ? query : settled;
  const ready = word === query;
  const { environmentId, workspaceRoot: cwd } = project;
  const pullRequestsAvailable =
    sourceControlClients.repositorySelector(project.repositoryIdentity) != null;

  const files = useAtomValue(
    trigger?.kind === "file" && ready
      ? projectEnvironment.searchEntries({
          environmentId,
          input: { cwd, query: word.slice(0, 256), limit: FILE_LIMIT },
        })
      : idle,
  );
  const list = useAtomValue(
    trigger?.kind === "pull-request" && pullRequestsAvailable && ready
      ? pullRequestEnvironment.list({
          environmentId,
          input: {
            state: "all",
            projectId: project.id,
            limit: PULL_REQUEST_LIMIT,
            ...(/^\d*$/.test(word) ? {} : { query: word }),
          },
        })
      : idle,
  );
  const listRead = toRead(list);
  const target = detailTarget(word, listRead.state === "ready" ? listRead.value.entries : []);
  const detail = useAtomValue(
    target
      ? pullRequestEnvironment.detail({
          environmentId,
          input: { projectId: project.id, ...target },
        })
      : idle,
  );
  return resolveLookup({
    kind: trigger?.kind,
    projectId: project.id,
    pullRequestsAvailable,
    files: toRead(files),
    list: listRead,
    detail: target ? toRead(detail) : null,
  });
}
