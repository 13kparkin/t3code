import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { PanelLeft } from "lucide-react";
import { useContext } from "react";

import { sidebarOpenAtom } from "../browser/panel";
import { iconButton } from "../browser/styles";
import { Tooltip } from "../ui/Tooltip";

// The macOS window buttons sit inset at the top bar's left edge, so the button starts past them.
const TRAFFIC_LIGHTS = window.board !== undefined && navigator.userAgent.includes("Mac");

/** The top bar's button for the left sidebar, the mirror of the right sidebar's. */
export function SidebarToggle() {
  const registry = useContext(RegistryContext);
  const open = useAtomValue(sidebarOpenAtom);
  return (
    <div style={{ marginLeft: TRAFFIC_LIGHTS ? 72 : "env(titlebar-area-x, 0px)" }}>
      <Tooltip text={open ? "Hide the left sidebar" : "Show the left sidebar"} side="bottom">
        <button
          type="button"
          aria-label={open ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={open}
          onClick={() => registry.set(sidebarOpenAtom, !open)}
          className={iconButton}
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
