import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Check, ListChecks } from "lucide-react";
import { useContext, useState } from "react";

import { pickTemplate, SYSTEM_TEMPLATE } from "../domain/reviewTemplate";
import { reviewTemplatesAtom, setBoardReviewTemplate } from "../state/reviews";
import type { ValidBoard } from "../store/boardFiles";
import { FileBox } from "./FileBox";
import { SectionHeading } from "./SectionHeading";
import { Tile } from "./Tile";

const HOME = { x: 0, y: 0 };

/** The review templates the board can use, with the current one marked. A press picks one. */
export function ReviewSection({
  project,
  listed,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
}) {
  const registry = useContext(RegistryContext);
  const custom = useAtomValue(reviewTemplatesAtom);
  const [error, setError] = useState<string | null>(null);
  const picked = pickTemplate(listed.board.reviewTemplate, custom);
  return (
    <FileBox
      boardId={listed.board.id}
      boxKey="review"
      place="row"
      label="Review"
      fallback={HOME}
      title={<SectionHeading name="Review" note={picked.name} />}
    >
      {[SYSTEM_TEMPLATE, ...custom].map((template) => {
        const current = template.name === picked.name;
        return (
          <li key={template.name} className="min-w-0">
            <Tile
              icon={current ? Check : ListChecks}
              title={template.name}
              hint={current ? "Current" : "Use this template"}
              onClick={() => {
                setError(null);
                void setBoardReviewTemplate(
                  registry,
                  project,
                  listed,
                  template === SYSTEM_TEMPLATE ? undefined : template.name,
                ).then(setError);
              }}
            />
          </li>
        );
      })}
      {error !== null && (
        <li role="alert" className="col-span-full text-[11px] break-words text-red-400">
          {error}
        </li>
      )}
    </FileBox>
  );
}
