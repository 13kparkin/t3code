import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  Bot,
  FileDiff,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  Plus,
  ScrollText,
  Ticket,
} from "lucide-react";
import { useContext } from "react";

import {
  activateTab,
  browserAtom,
  closeAgents,
  closeTab,
  openTab,
  showAgents,
} from "../browser/browserTabs";
import { browserHost } from "../browser/host";
import { ticketChoiceAtom } from "../browser/panel";
import { iconButton } from "../browser/styles";
import type { Tab } from "../browser/tabs";
import {
  closeFile,
  closePage,
  type FileRef,
  fileKey,
  filesViewAtom,
  sameFile,
  showBoard,
  showFile,
  showSurface,
} from "../state/filesView";
import { Tooltip } from "../ui/Tooltip";
import { ClosableTab, DIM, LIT, TAB } from "./ClosableTab";
import { nameOf } from "./target";

const pageLabel = (tab: Tab): string => {
  if (tab.title !== "") return tab.title;
  try {
    return new URL(tab.url).host || "New tab";
  } catch {
    return "New tab";
  }
};

/** A file's name, a file's diff the way Orca names it, and the diff of every file by what it compares. */
function tabLabel(file: FileRef): string {
  if (file.diff === undefined) return nameOf(file.path);
  if (file.path !== "") return `${nameOf(file.path)} (diff)`;
  if (file.diff.kind === "commit") return `Commit ${file.diff.sha.slice(0, 7)}`;
  return file.diff.kind === "branch-range" ? "Branch changes" : "Changes";
}

/** The main view's tabs, drawn the way Orca's are. */
export function MainTabStrip({ files }: { files: ReadonlyArray<FileRef> }) {
  const registry = useContext(RegistryContext);
  const { active, surface, ticket, card, agent } = useAtomValue(filesViewAtom);
  const ticketKey = useAtomValue(ticketChoiceAtom)?.ticketKey ?? null;
  const { tabs, agents } = useAtomValue(browserAtom);
  const onBoard = active === null && surface === null;
  return (
    <div
      role="tablist"
      aria-label="Main view tabs"
      className="flex shrink-0 items-stretch overflow-x-auto border-b border-line bg-sidebar"
    >
      <button
        type="button"
        role="tab"
        aria-selected={onBoard}
        onClick={() => showBoard(registry)}
        className={`${TAB} ${onBoard ? LIT : DIM}`}
      >
        <LayoutDashboard className="size-3.5 shrink-0" aria-hidden />
        Board
      </button>
      {ticket && (
        <ClosableTab
          shown={surface === "ticket"}
          icon={<Ticket className="size-3.5 shrink-0" aria-hidden />}
          label={ticketKey ?? "Ticket"}
          onSelect={() => showSurface(registry, "ticket")}
          onClose={() => closePage(registry, "ticket")}
        />
      )}
      {card !== null && (
        <ClosableTab
          shown={surface === "card"}
          icon={<Inbox className="size-3.5 shrink-0 text-amber-300" aria-hidden />}
          label="For you"
          onSelect={() => showSurface(registry, "card")}
          onClose={() => closePage(registry, "card")}
        />
      )}
      {agent !== null && (
        <ClosableTab
          shown={surface === "agent"}
          icon={<ScrollText className="size-3.5 shrink-0" aria-hidden />}
          label={agent.label}
          onSelect={() => showSurface(registry, "agent")}
          onClose={() => closePage(registry, "agent")}
        />
      )}
      {files.map((file) => (
        <ClosableTab
          key={fileKey(file)}
          shown={active !== null && sameFile(active, file)}
          icon={
            file.diff === undefined ? (
              <FileText className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <FileDiff className="size-3.5 shrink-0 text-amber-300" aria-hidden />
            )
          }
          label={tabLabel(file)}
          onSelect={() => showFile(registry, file)}
          onClose={() => closeFile(registry, file)}
        />
      ))}
      {tabs.tabs.map((tab) => (
        <ClosableTab
          key={tab.id}
          shown={surface === "page" && tab.id === tabs.activeId}
          icon={<Globe className="size-3.5 shrink-0 text-sky-400" aria-hidden />}
          label={pageLabel(tab)}
          onSelect={() => activateTab(registry, tab.id)}
          onClose={() => closeTab(registry, tab.id)}
        />
      ))}
      {agents && (
        <ClosableTab
          shown={surface === "agents"}
          icon={<Bot className="size-3.5 shrink-0" aria-hidden />}
          label="Agent tabs"
          onSelect={() => showAgents(registry)}
          onClose={() => closeAgents(registry)}
        />
      )}
      {browserHost !== null && (
        <Tooltip text="New browser tab" side="bottom">
          <button
            type="button"
            aria-label="New browser tab"
            onClick={() => openTab(registry, "")}
            className={`${iconButton} m-1`}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
