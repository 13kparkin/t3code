import { RegistryContext, useAtomMount, useAtomValue } from "@effect/atom-react";
import { useContext } from "react";

import { OpenBoard } from "./board/OpenBoard";
import { sidebarOpenAtom } from "./browser/panel";
import { attachDockSlot } from "./browser/panel";
import { PanelHost } from "./browser/PanelHost";
import { PanelToggle } from "./browser/PanelToggle";
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
import { settingsPageAtom } from "./state/settingsPage";
import { updateWatcherAtom } from "./state/updatesAtoms";
import { UsageBar } from "./usage/UsageBar";

export function App() {
  const registry = useContext(RegistryContext);
  const settingsPage = useAtomValue(settingsPageAtom);
  const sidebarOpen = useAtomValue(sidebarOpenAtom);
  const agentPanelOpen = useAtomValue(agentPanelAtom) !== null;
  const setSettingsPage = (page: SettingsPage | null) => registry.set(settingsPageAtom, page);
  useAtomMount(updateWatcherAtom);
  useAtomMount(connectionWatchAtom);
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
          <ForYouPanel />
          <ArchivedPanel />
          <div
            ref={attachDockSlot}
            // The agent slide-out is w-96 (24rem) over the board, so the dock stops at its left edge.
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-4 pl-4 *:pointer-events-auto ${agentPanelOpen ? "pr-[25rem]" : "pr-4"}`}
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
      <ForYouToasts />
      <UpdateToasts onOpen={() => setSettingsPage("updates")} />
      <UsageBar />
    </div>
  );
}
