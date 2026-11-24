import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useContext } from "react";

import { EmptyFiles } from "../files/EmptyFiles";
import { filesViewAtom } from "../state/filesView";
import type { BoardForYou } from "../state/forYou";
import type { ValidBoard } from "../store/boardFiles";
import { ForYouCard } from "./ForYouCard";
import { cardContext } from "./ForYouLane";

/** The For you card open as a tab over the canvas, at reading width. */
export function ForYouPage({
  project,
  listed,
  forYou,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  forYou: BoardForYou;
}) {
  const registry = useContext(RegistryContext);
  const id = useAtomValue(filesViewAtom).card;
  const view = forYou.views.find((entry) => entry.card.id === id);
  if (view === undefined) return <EmptyFiles>This item is no longer on the board</EmptyFiles>;
  return (
    <div
      data-testid="foryou-page"
      className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-gutter-both"
    >
      <div className="mx-auto max-w-2xl">
        <ForYouCard view={view} context={cardContext(registry, project, listed, false)} />
      </div>
    </div>
  );
}
