import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useContext } from "react";

import { EmptyFiles } from "../files/EmptyFiles";
import { filesViewAtom } from "../state/filesView";
import { CARD_STATE, cardKindLabel, cardTitle } from "../domain/forYou";
import type { BoardForYou } from "../state/forYou";
import type { ValidBoard } from "../store/boardFiles";
import { DocPage } from "../ui/DocPage";
import { ForYouCard } from "./ForYouCard";
import { cardContext } from "./ForYouLane";

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
    <DocPage
      title={cardTitle(view.card)}
      lead={`${cardKindLabel(view.card)} · ${CARD_STATE[view.state].label}`}
      sections={[
        {
          id: "card",
          body: (
            <ForYouCard view={view} context={cardContext(registry, project, listed, false)} page />
          ),
        },
      ]}
    />
  );
}
