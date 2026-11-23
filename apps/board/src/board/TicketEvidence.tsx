import { ArtifactCards } from "./ArtifactCards";
import type { SectionProps } from "./sectionProps";

export function TicketEvidence({ artifacts }: SectionProps) {
  return <ArtifactCards artifacts={artifacts} />;
}
