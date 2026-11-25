import { createContext, useContext } from "react";

import type { ArtifactGroups } from "../domain/artifact";
import type { FilesBoard } from "../files/target";
import type { Artifact } from "../store/artifacts";

export interface ArtifactsValue {
  /** The roots a file is opened under, and the threads it is served and reported under. */
  readonly files: FilesBoard;
  readonly all: ReadonlyArray<Artifact>;
  /** The listing has answered at least once, so a missing file is really missing. */
  readonly loaded: boolean;
  readonly groups: ArtifactGroups<Artifact>;
  readonly open: (artifact: Artifact) => void;
}

const ArtifactsContext = createContext<ArtifactsValue | null>(null);

export const ArtifactsProvider = ArtifactsContext.Provider;

export function useArtifacts(): ArtifactsValue {
  const value = useContext(ArtifactsContext);
  if (value === null) throw new Error("useArtifacts needs an ArtifactsProvider");
  return value;
}
