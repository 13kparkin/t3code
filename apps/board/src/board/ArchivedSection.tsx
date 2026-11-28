import { ArchiveRestore } from "lucide-react";

import type { ArchivedCard } from "../state/cardStates";
import { FileBox } from "./FileBox";
import { SectionHeading } from "./SectionHeading";
import { Tile } from "./Tile";

const HOME = { x: 0, y: 0 };

/** The board's archived cards, each with a press that unarchives it. */
export function ArchivedSection({
  boardId,
  archived,
  onUnarchive,
}: {
  boardId: string;
  archived: ReadonlyArray<ArchivedCard>;
  onUnarchive: (key: string) => void;
}) {
  return (
    <FileBox
      boardId={boardId}
      boxKey="archived"
      place="row"
      label="Archived"
      fallback={HOME}
      title={<SectionHeading name="Archived" note={String(archived.length)} />}
    >
      {archived.length === 0 ? (
        <li className="text-[11px] text-faint">Nothing is archived.</li>
      ) : (
        archived.map((card) => (
          <li key={card.key} className="min-w-0">
            <Tile
              icon={ArchiveRestore}
              title={card.label}
              hint="Unarchive"
              onClick={() => onUnarchive(card.key)}
            />
          </li>
        ))
      )}
    </FileBox>
  );
}
