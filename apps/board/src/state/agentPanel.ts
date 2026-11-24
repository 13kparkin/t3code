import { Atom, type AtomRegistry } from "effect/reactivity";

export const agentPanelAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("agent-panel"),
);

export const openAgentPanel = (registry: AtomRegistry.AtomRegistry, threadId: string) =>
  registry.set(agentPanelAtom, threadId);

export const closeAgentPanel = (registry: AtomRegistry.AtomRegistry) =>
  registry.set(agentPanelAtom, null);
