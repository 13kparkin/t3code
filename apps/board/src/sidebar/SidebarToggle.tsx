import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { PanelLeft } from "lucide-react";
import { useContext } from "react";

import { sidebarModeAtom } from "../browser/panel";
import { iconButton } from "../browser/styles";
import { Tooltip } from "../ui/Tooltip";

// The macOS window buttons sit inset at the top bar's left edge, so the button starts past them.
const TRAFFIC_LIGHTS = window.board !== undefined && navigator.userAgent.includes("Mac");

export function SidebarToggle() {
  const registry = useContext(RegistryContext);
  const open = useAtomValue(sidebarModeAtom) === "expanded";
  return (
    <div style={{ marginLeft: TRAFFIC_LIGHTS ? 72 : "env(titlebar-area-x, 0px)" }}>
      <Tooltip text={open ? "Fold the sidebar to icons" : "Show the full sidebar"} side="bottom">
        <button
          type="button"
          aria-label={open ? "Fold sidebar" : "Show full sidebar"}
          aria-pressed={open}
          onClick={() => registry.set(sidebarModeAtom, open ? "rail" : "expanded")}
          className={iconButton}
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
