import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";

import type { CallEvent } from "../domain/board";
import type { ArchivedCard } from "../state/cardStates";
import type { ValidBoard } from "../store/boardFiles";
import { ArchivedSection } from "./ArchivedSection";
import { ArtifactArea } from "./ArtifactArea";
import { sectionFilterId } from "./layout";
import { ReviewSection } from "./ReviewSection";

/** The sections right of the orchestrator card that its buttons show. */
export function BoardSections({
  project,
  listed,
  hidden,
  calls,
  archived,
  onUnarchive,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  hidden: ReadonlySet<string>;
  calls: ReadonlyArray<CallEvent>;
  archived: ReadonlyArray<ArchivedCard>;
  onUnarchive: (key: string) => void;
}) {
  return (
    <>
      {!hidden.has(sectionFilterId("artifacts")) && (
        <ArtifactArea project={project} listed={listed} calls={calls} />
      )}
      {!hidden.has(sectionFilterId("archived")) && (
        <ArchivedSection boardId={listed.board.id} archived={archived} onUnarchive={onUnarchive} />
      )}
      {!hidden.has(sectionFilterId("review")) && (
        <ReviewSection project={project} listed={listed} />
      )}
    </>
  );
}
