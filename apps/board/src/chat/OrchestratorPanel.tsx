import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { ThreadId } from "@t3tools/contracts";
import { useContext } from "react";
import { createPortal } from "react-dom";

import { dockSlotAtom, showPanelTab } from "../browser/panel";

import type { ValidBoard } from "../store/boardFiles";
import { Conversation } from "./Conversation";
import { PanelHeader } from "./PanelHeader";
import { StartOrchestrator } from "./StartOrchestrator";

/** The chat with a board's orchestrator, in the side panel's first tab. */
export function OrchestratorPanel({
  project,
  listed,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
}) {
  const registry = useContext(RegistryContext);
  const dock = useAtomValue(dockSlotAtom);
  const threadId = listed.board.orchestratorThreadId;
  return (
    <section aria-label="Orchestrator" className="flex min-h-0 flex-1 flex-col">
      {threadId === null ? (
        <>
          <PanelHeader title={listed.board.name} status="Not started" />
          <StartOrchestrator project={project} listed={listed} />
          {dock !== null &&
            createPortal(
              <button
                type="button"
                onClick={() => showPanelTab(registry, "chat")}
                className="rounded-full border border-line bg-panel px-4 py-2 text-muted shadow-panel hover:text-fg"
              >
                Start the orchestrator
              </button>,
              dock,
            )}
        </>
      ) : (
        <Conversation project={project} listed={listed} threadId={ThreadId.make(threadId)} />
      )}
    </section>
  );
}
