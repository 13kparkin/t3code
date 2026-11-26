import { BOARDS_DIR } from "@agent-board/app/domain/board";
import { AVAILABLE_CONNECTION_STATE } from "@t3tools/client-runtime/connection";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { createEnvironmentProjectAtoms } from "@t3tools/client-runtime/state/projects";
import {
  createEnvironmentRpcCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  createEnvironmentShellAtoms,
  createEnvironmentSnapshotAtom,
} from "@t3tools/client-runtime/state/shell";
import { type EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import { parseUrl } from "@t3tools/shared/url";
import * as Option from "effect/Option";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";
import { Linking } from "react-native";

import { readPairingRequest } from "./pairing";
import { connectionAtomRuntime, connectPairingUrl, environmentCatalog } from "./runtime";
import { type EngineStatus, pairedEngineStatus } from "./status";

/** The one engine the phone is paired with, and how its connection is doing. */
export const engineStatusAtom = Atom.make((get): EngineStatus => {
  const catalog = get(environmentCatalog.catalogValueAtom);
  if (!catalog.isReady) return { kind: "loading" };
  const [entry] = catalog.entries.values();
  if (entry === undefined) return { kind: "unpaired" };
  const { environmentId, label } = entry.target;
  const state = AsyncResult.getOrElse(
    get(environmentCatalog.stateAtom(environmentId)),
    () => AVAILABLE_CONNECTION_STATE,
  );
  return pairedEngineStatus(environmentId, label, state);
}).pipe(Atom.withLabel("engine-status"));

const environmentShell = createEnvironmentShellAtoms(connectionAtomRuntime);
const environmentProjects = createEnvironmentProjectAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: createEnvironmentSnapshotAtom(environmentShell.stateAtom),
});

const listEntries = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "phone:project:list-entries",
  tag: WS_METHODS.projectsListEntries,
});

const engineConnectedAtom = Atom.make((get) => get(engineStatusAtom).kind === "connected").pipe(
  Atom.withLabel("engine-connected"),
);

/** The engine's projects that hold a board folder, or null until the first check answers. */
export const boardProjectsAtom = Atom.make((get): ReadonlyArray<EnvironmentProject> | null => {
  const projects = get(environmentProjects.projectsAtom);
  if (get(engineConnectedAtom)) {
    const registry = get.registry;
    const holdsBoard = async (project: EnvironmentProject) =>
      (
        await runAtomCommand(
          registry,
          listEntries,
          {
            environmentId: project.environmentId,
            input: { cwd: project.workspaceRoot, directoryPath: BOARDS_DIR },
          },
          { reportFailure: false },
        )
      )._tag === "Success";
    let current = true;
    get.addFinalizer(() => {
      current = false;
    });
    void (async () => {
      const found: Array<EnvironmentProject> = [];
      for (const project of projects) if (await holdsBoard(project)) found.push(project);
      if (current) get.setSelf(found);
    })();
  }
  return Option.getOrNull(get.self<ReadonlyArray<EnvironmentProject> | null>());
}).pipe(Atom.withLabel("board-projects"));

export interface PairingState {
  readonly busy: boolean;
  readonly error: string | null;
}

export const pairingStateAtom = Atom.make<PairingState>({ busy: false, error: null }).pipe(
  Atom.keepAlive,
  Atom.withLabel("pairing-state"),
);

/** Validates the input before anything is sent or saved, then redeems it with the engine. */
export async function pair(registry: AtomRegistry.AtomRegistry, input: string) {
  let pairingUrl: string;
  try {
    ({ pairingUrl } = readPairingRequest(input));
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "That is not a pairing link.";
    registry.set(pairingStateAtom, { busy: false, error });
    return;
  }
  registry.set(pairingStateAtom, { busy: true, error: null });
  const result = await runAtomCommand(registry, connectPairingUrl, pairingUrl, {
    reportFailure: false,
  });
  const failure = result._tag === "Failure" ? squashAtomCommandFailure(result) : null;
  registry.set(pairingStateAtom, {
    busy: false,
    error: failure === null ? null : failure instanceof Error ? failure.message : String(failure),
  });
}

export const unpair = (registry: AtomRegistry.AtomRegistry, environmentId: EnvironmentId) =>
  environmentCatalog.remove.run(registry, environmentId);

/** What the pairing field holds, typed or filled in from a deep link. */
export const pairingInputAtom = Atom.make("").pipe(Atom.keepAlive, Atom.withLabel("pairing-input"));

// The launch link stays the initial URL for the whole process, and its one-time code may be spent.
let launchLinkRead = false;

/**
 * Fills the pairing field from an `agentboard-phone://pair` link while it is mounted. Any app can
 * open the scheme, so the user still taps Pair. Other links, such as the dev client's, are ignored.
 */
export const deepLinkPairingAtom = Atom.make((get) => {
  const registry = get.registry;
  const offer = (url: string | null | undefined) => {
    if (url && parseUrl(url)?.host === "pair") registry.set(pairingInputAtom, url);
  };
  const subscription = Linking.addEventListener("url", ({ url }) => offer(url));
  get.addFinalizer(() => subscription.remove());
  if (launchLinkRead) return;
  launchLinkRead = true;
  void Linking.getInitialURL().then(offer);
}).pipe(Atom.withLabel("deep-link-pairing"));
