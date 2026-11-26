import { RegistryContext, useAtomMount, useAtomValue } from "@effect/atom-react";
import { useContext } from "react";

import { OpenBoard } from "./board/OpenBoard";
import { sidebarOpenAtom } from "./browser/panel";
import { attachDockSlot } from "./browser/panel";
import { PanelHost } from "./browser/PanelHost";
import { PanelToggle } from "./browser/PanelToggle";
import { CallPrompt } from "./calls/CallPrompt";
import { RecordingBar } from "./calls/RecordingBar";
import { ForYouPanel } from "./foryou/ForYouPanel";
import { ArchivedPanel } from "./sidebar/ArchivedPanel";
import { EngineStatus } from "./sidebar/EngineStatus";
import { EngineVersion } from "./sidebar/EngineVersion";
import { SettingsScreen } from "./settings/SettingsScreen";
import type { SettingsPage } from "./settings/SettingsNav";
import { ForYouToasts } from "./sidebar/ForYouToasts";
import { Sidebar } from "./sidebar/Sidebar";
import { SidebarToggle } from "./sidebar/SidebarToggle";
import { UpdateToasts } from "./sidebar/UpdateToasts";
import { connectionWatchAtom } from "./state/engine";
import { agentPanelAtom } from "./state/agentPanel";
import { recorderAtom, startingCallsAtom, toastRecordAtom } from "./state/recorder";
import { settingsPageAtom } from "./state/settingsPage";
import { updateWatcherAtom } from "./state/updatesAtoms";
import { UsageBar } from "./usage/UsageBar";

export function App() {
  const registry = useContext(RegistryContext);
  const settingsPage = useAtomValue(settingsPageAtom);
  const sidebarOpen = useAtomValue(sidebarOpenAtom);
  const agentPanelOpen = useAtomValue(agentPanelAtom) !== null;
  const recorder = useAtomValue(recorderAtom)?.state;
  const setSettingsPage = (page: SettingsPage | null) => registry.set(settingsPageAtom, page);
  useAtomMount(updateWatcherAtom);
  useAtomMount(connectionWatchAtom);
  useAtomMount(startingCallsAtom);
  useAtomMount(toastRecordAtom);
  return (
    <div className="grid h-full grid-rows-[var(--topbar-height)_minmax(0,1fr)_auto]">
      <header className="drag-region flex items-center justify-between border-b border-line bg-bg px-2">
        <SidebarToggle />
        <PanelToggle />
      </header>
      {/* Hidden, not unmounted, so the viewport keeps its pan and zoom while settings are open. */}
      <div
        className={
          settingsPage !== null
            ? "hidden"
            : `grid min-h-0 grid-rows-[minmax(0,1fr)] ${sidebarOpen ? "grid-cols-[240px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`
        }
      >
        {sidebarOpen && (
          <Sidebar
            footer={
              <>
                <EngineStatus />
                <EngineVersion />
              </>
            }
            onOpenSettings={() => {
              performance.mark("board:settings-click");
              setSettingsPage("worktrees");
            }}
          />
        )}
        <main className="relative min-h-0 min-w-0">
          <OpenBoard />
          {recorder?.status === "recording" && <RecordingBar state={recorder} />}
          <ForYouPanel />
          <ArchivedPanel />
          <div
            ref={attachDockSlot}
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end pb-6 pl-6 [container-type:inline-size] *:pointer-events-auto ${agentPanelOpen ? "pr-[calc(var(--agent-panel-width)+1.5rem)]" : "pr-6"}`}
          />
        </main>
        <PanelHost />
      </div>
      {settingsPage !== null && (
        <SettingsScreen
          page={settingsPage}
          onPage={setSettingsPage}
          onBack={() => setSettingsPage(null)}
        />
      )}
      <CallPrompt />
      <ForYouToasts />
      <UpdateToasts onOpen={() => setSettingsPage("updates")} />
      <UsageBar />
    </div>
  );
}
