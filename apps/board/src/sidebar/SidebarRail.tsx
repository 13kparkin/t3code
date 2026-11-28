import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { FolderClosed, type LucideIcon, PanelLeftOpen, Settings } from "lucide-react";
import { useContext } from "react";

import { sidebarModeAtom } from "../browser/panel";
import { updateNoticeAtom } from "../state/updatesAtoms";
import { Tooltip } from "../ui/Tooltip";
import { useNavItems } from "./navItems";

const RAIL_BUTTON =
  "relative grid size-8 place-items-center text-fg opacity-60 hover:opacity-100 aria-[current=page]:opacity-100";

/** The sidebar folded to a column of line icons, with no background of its own. */
export function SidebarRail({ onOpenSettings }: { onOpenSettings: () => void }) {
  const registry = useContext(RegistryContext);
  const nav = useNavItems();
  const updateOffered = useAtomValue(updateNoticeAtom);
  const expand = () => registry.set(sidebarModeAtom, "expanded");
  const button = (
    key: string,
    Icon: LucideIcon,
    label: string,
    onPress: () => void,
    options: { selected?: boolean; dot?: string } = {},
  ) => (
    <Tooltip key={key} text={label} side="right">
      <button
        type="button"
        aria-label={label}
        aria-current={options.selected ? "page" : undefined}
        onClick={onPress}
        className={RAIL_BUTTON}
      >
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        {options.dot !== undefined && (
          <span className={`absolute top-1 right-1 size-[7px] rounded-full ${options.dot}`} />
        )}
      </button>
    </Tooltip>
  );
  const item = (id: keyof typeof nav, dot?: string) =>
    button(id, nav[id].icon, nav[id].label, nav[id].onPress, {
      selected: nav[id].selected,
      ...(nav[id].urgent && dot !== undefined ? { dot } : {}),
    });
  return (
    <nav aria-label="Sidebar" className="flex min-h-0 flex-col items-center gap-1 py-3">
      {item("foryou", "bg-amber-500")}
      {item("browser")}
      {button("projects", FolderClosed, "Projects", expand)}
      <div className="flex-1" />
      {item("archived")}
      {button(
        "settings",
        Settings,
        updateOffered ? "Settings, update available" : "Settings",
        onOpenSettings,
        updateOffered ? { dot: "bg-sky-400" } : {},
      )}
      {button("expand", PanelLeftOpen, "Show the full sidebar", expand)}
    </nav>
  );
}
