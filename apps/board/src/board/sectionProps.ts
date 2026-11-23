import type { EnvironmentId } from "@t3tools/contracts";

import type { AgentView, TicketView } from "../state/boardModel";
import type { Artifact } from "../store/artifacts";

export interface SectionProps {
  readonly environmentId: EnvironmentId;
  readonly view: TicketView;
  /** The agent whose log the Activity section shows. */
  readonly agent: AgentView | null;
  readonly artifacts: ReadonlyArray<Artifact>;
}
