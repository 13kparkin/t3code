import type { Artifact } from "../store/artifacts";
import { ArtifactCard } from "./ArtifactCard";
import { ARTIFACT_GAP } from "./layout";

export function ArtifactCards({ artifacts }: { artifacts: ReadonlyArray<Artifact> }) {
  return (
    <div data-testid="artifact-cards" className="flex flex-col" style={{ gap: ARTIFACT_GAP }}>
      {artifacts.map((artifact) => (
        <ArtifactCard key={artifact.absolutePath} artifact={artifact} />
      ))}
    </div>
  );
}
