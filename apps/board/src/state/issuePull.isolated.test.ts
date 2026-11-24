import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ reads: new Array<string>() }));

vi.mock("./projects", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    environmentProjects: {
      projectsAtom: Atom.make([{ id: "p", environmentId: "e", workspaceRoot: "/p" }]),
    },
  };
});
vi.mock("./orchestrator", async () => {
  const { Atom } = await import("effect/reactivity");
  const tickets = JSON.stringify(
    ["T-1", "T-2"].map((key) => ({
      key,
      title: key,
      stage: "building",
      issue: { tracker: "github", key: `#${key}` },
    })),
  );
  const files = Atom.make({ tickets, details: null });
  return { boardStoreAtom: () => files };
});
vi.mock("../issues/issueLinks", () => ({
  ticketIssueRef: (ticket: { key: string }) => ticket.key,
}));
vi.mock("./issues", () => ({
  readIssueDetail: async (_registry: AtomRegistry.AtomRegistry, _env: string, ref: string) => {
    mocks.reads.push(ref);
    return { title: "t", body: "b", url: "u" };
  },
}));
vi.mock("./ticketEdit", () => ({ savePulled: async () => null }));

import { issuePullAtom } from "./issuePull";

describe("the issue pull rounds", () => {
  it("Given two rounds inside one stagger window, when the timers run, then each linked ticket is read once", async () => {
    vi.useFakeTimers();
    const handlers: Array<() => void> = [];
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: (_type: string, handler: () => void) => handlers.push(handler),
      removeEventListener: () => {},
    });
    const registry = AtomRegistry.make();
    const unmount = registry.mount(issuePullAtom("p/board"));
    handlers[0]?.();
    await vi.advanceTimersByTimeAsync(60_000);
    unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    expect(mocks.reads.toSorted()).toEqual(["T-1", "T-2"]);
  });
});
