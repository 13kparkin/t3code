import { MessageId, type RuntimeMode, ThreadId } from "@t3tools/contracts";
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";

const modes = vi.hoisted(() => new Array<RuntimeMode>());

vi.mock("@t3tools/client-runtime/operations", async (original) => ({
  ...(await original<object>()),
  setThreadRuntimeMode: (input: { runtimeMode: RuntimeMode }) =>
    Effect.sync(() => modes.push(input.runtimeMode)),
  startThreadTurn: () => Effect.fail("dispatch refused"),
}));

vi.mock("../connection/runtime", async () => {
  const { Atom } = await import("effect/reactivity");
  const Layer = await import("effect/Layer");
  return { connectionAtomRuntime: Atom.runtime(Layer.empty) };
});

import { runStartTurn } from "./threads";

// SAFETY: the mocked operations never read the environment services the real ones need.
const unused = {} as never;

it("puts the thread's mode back when the turn after a mode change fails", async () => {
  const turn = runStartTurn({
    threadId: ThreadId.make("t"),
    message: { messageId: MessageId.make("m"), role: "user", text: "", attachments: [] },
    runtimeMode: "approval-required",
    interactionMode: "default",
    previousRuntimeMode: "full-access",
  }).pipe(
    Effect.flip,
    Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, unused),
    Effect.provideService(SecureRandom.SecureRandom, unused),
  );
  expect(await turn.pipe(Effect.runPromise)).toBe("dispatch refused");
  expect(modes).toEqual(["approval-required", "full-access"]);
});
