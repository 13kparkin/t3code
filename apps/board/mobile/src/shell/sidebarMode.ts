import type { SidebarMode } from "@agent-board/app/domain/sidebar";
import { Atom } from "effect/reactivity";
import * as SecureStore from "expo-secure-store";

const KEY = "agentboard.sidebar-mode";

/** The wide layout's sidebar, full or folded to its rail, kept on this phone. */
export const sidebarModeAtom = Atom.writable(
  (): SidebarMode => {
    try {
      return SecureStore.getItem(KEY) === "rail" ? "rail" : "expanded";
    } catch (error) {
      console.warn("Could not read the sidebar mode.", error);
      return "expanded";
    }
  },
  (context, mode: SidebarMode) => {
    context.setSelf(mode);
    try {
      SecureStore.setItem(KEY, mode);
    } catch (error) {
      console.warn("Could not save the sidebar mode.", error);
    }
  },
).pipe(Atom.keepAlive, Atom.withLabel("phone-sidebar-mode"));
