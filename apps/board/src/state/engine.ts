import { Atom } from "effect/reactivity";

import { engineBridge } from "../connection/bridge";
import type { EngineState } from "../connection/engineState";
import {
  type EngineConnection,
  engineConnectionAtom,
  engineEnvironmentIdAtom,
  environmentCatalog,
} from "./projects";

export const engineStateAtom = Atom.make<EngineState>((get) => {
  // Subscribe before the read so a change between the two is not lost.
  get.addFinalizer(engineBridge.onEngineState((state) => get.setSelf(state)));
  void engineBridge.engineState().then((state) => get.setSelf(state));
  return { phase: "connecting" };
}).pipe(Atom.withLabel("engine-state"));

export type EngineStatus =
  | { readonly tone: "ok" | "busy" | "off"; readonly text: string; readonly detail?: string }
  | { readonly tone: "ask"; readonly question: string; readonly accept: string };

/** What the footer shows for the engine T3 runs and the connection to it. */
export function deriveEngineStatus(
  engine: EngineState,
  connection: EngineConnection,
): EngineStatus {
  switch (engine.phase) {
    case "starting":
      return { tone: "busy", text: "Starting T3 in WSL" };
    case "installing":
      return { tone: "busy", text: "Installing T3 in WSL" };
    case "updating":
      return { tone: "busy", text: "Updating T3 in WSL" };
    case "connecting":
      return { tone: "busy", text: "Connecting" };
    case "install-needed":
      return {
        tone: "ask",
        question: "T3 is not installed in WSL. Install it now?",
        accept: "Install",
      };
    case "update-needed":
      return {
        tone: "ask",
        question: `T3 in WSL is ${engine.found}, which is too old for this app. Update it now?`,
        accept: "Update",
      };
    case "offline":
      return { tone: "off", text: "Offline", detail: engine.reason };
    case "ready":
      if (connection.unsupportedReason !== undefined) {
        return { tone: "off", text: "Offline", detail: connection.unsupportedReason };
      }
      if (connection.state.phase === "connected") {
        return { tone: "ok", text: "Engine connected" };
      }
      if (connection.state.phase === "blocked") {
        return {
          tone: "off",
          text: "Offline",
          detail: connection.state.lastFailure?.detail ?? "The engine refused the connection",
        };
      }
      return { tone: "busy", text: "Connecting" };
  }
}

export const engineStatusAtom = Atom.make((get) =>
  deriveEngineStatus(get(engineStateAtom), get(engineConnectionAtom)),
).pipe(Atom.withLabel("engine-status"));

/** The supervisor's own wait grows to minutes and resets only when the window becomes visible again. */
const RETRY_WHEN_STUCK_MS = 30_000;
const STUCK_PHASES: ReadonlySet<string> = new Set(["backoff", "blocked"]);

const connectionPhaseAtom = Atom.make((get) => {
  const { state } = get(engineConnectionAtom);
  return `${state.phase}\t${state.lastFailure?.detail ?? ""}`;
}).pipe(Atom.withLabel("engine-connection-phase"));

/** Logs each phase change, and asks for a retry once the connection is stuck. */
export const connectionWatchAtom = Atom.make((get) => {
  const line = get(connectionPhaseAtom);
  const environmentId = get(engineEnvironmentIdAtom);
  engineBridge.logConnection(`${new Date().toISOString()}\t${line}`);
  if (environmentId === null || !STUCK_PHASES.has(get.once(engineConnectionAtom).state.phase))
    return;
  const registry = get.registry;
  const timer = setTimeout(() => {
    engineBridge.logConnection(`${new Date().toISOString()}\tretry-requested`);
    void environmentCatalog.retryNow.run(registry, environmentId);
  }, RETRY_WHEN_STUCK_MS);
  get.addFinalizer(() => clearTimeout(timer));
}).pipe(Atom.withLabel("engine-connection-watch"));
