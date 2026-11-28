import { cardViews } from "@agent-board/app/domain/forYou";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useContext, useMemo } from "react";

import type { BoardChoice } from "../board/files";
import { forYouEngine } from "../state/threads";
import { boardSent, type ForYouTarget, forYouSentAtom, sentWritesAtom } from "./actions";
import { shownForYouAtom } from "./forYouAtoms";

/** The shown board's For you cards with their states, and where an answer to one goes. */
export function useForYouViews(choice: BoardChoice) {
  const registry = useContext(RegistryContext);
  const list = useAtomValue(shownForYouAtom);
  const sent = useAtomValue(forYouSentAtom);
  const writes = useAtomValue(sentWritesAtom);
  const views = useMemo(
    () =>
      list === null ? [] : cardViews(list.cards, boardSent(sent, writes, choice.key, list.cards)),
    [list, sent, writes, choice.key],
  );
  const orchestratorThreadId = choice.listed.ok ? choice.listed.board.orchestratorThreadId : null;
  const target = useMemo(
    (): ForYouTarget => ({
      registry,
      engine: forYouEngine(registry, choice.project.environmentId, orchestratorThreadId),
      environmentId: choice.project.environmentId,
      boardKey: choice.key,
      projectId: choice.project.id,
    }),
    [registry, choice, orchestratorThreadId],
  );
  return { views, target, problems: list?.problems.length ?? 0 };
}
