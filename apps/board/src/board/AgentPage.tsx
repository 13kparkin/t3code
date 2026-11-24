import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";

import { EmptyFiles } from "../files/EmptyFiles";
import type { BoardModel } from "../state/boardModel";
import { filesViewAtom } from "../state/filesView";
import { AgentLog } from "./AgentLog";

/** One agent's messages and work log as a tab over the canvas. */
export function AgentPage({
  environmentId,
  model,
}: {
  environmentId: EnvironmentId;
  model: BoardModel;
}) {
  const page = useAtomValue(filesViewAtom).agent;
  const agent = [
    ...Object.values(model.lanes)
      .flat()
      .flatMap((view) => view.agents),
    ...model.unassigned,
  ].find((entry) => entry.threadId === page?.threadId);
  if (page === null || agent === undefined) {
    return <EmptyFiles>This agent is no longer on the board</EmptyFiles>;
  }
  return (
    <div data-testid="agent-page" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-3 py-2.5">
        <h3 className="truncate font-semibold">{page.label}</h3>
        <p className="text-[11px] text-muted">{agent.title}</p>
      </header>
      <AgentLog key={agent.threadId} environmentId={environmentId} agent={agent} />
    </div>
  );
}
