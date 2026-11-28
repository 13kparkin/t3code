import { MessageId, type RuntimeMode, ThreadId } from "@t3tools/contracts";
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";

const engine = vi.hoisted(() => ({
  modes: new Array<RuntimeMode>(),
  refuseRestore: false,
  loseSetReply: false,
}));

vi.mock("@t3tools/client-runtime/operations", async (original) => ({
  ...(await original<object>()),
  setThreadRuntimeMode: (input: { runtimeMode: RuntimeMode }) =>
    engine.refuseRestore && engine.modes.length > 0
      ? Effect.fail("restore refused")
      : Effect.suspend(() => {
          engine.modes.push(input.runtimeMode);
          // The first set commits, but its reply never arrives.
          return engine.loseSetReply && engine.modes.length === 1
            ? Effect.fail("reply lost")
            : Effect.void;
        }),
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

it.each([
  {
    name: "keeps the stricter mode when the old one was full access",
    previous: "full-access",
    next: "approval-required",
    refuseRestore: false,
    loseSetReply: false,
    error: "dispatch refused",
    modes: ["approval-required"],
  },
  {
    name: "puts back a stricter old mode",
    previous: "approval-required",
    next: "full-access",
    refuseRestore: false,
    loseSetReply: false,
    error: "dispatch refused",
    modes: ["full-access", "approval-required"],
  },
  {
    name: "says which mode the thread was left in when the restore fails",
    previous: "approval-required",
    next: "full-access",
    refuseRestore: true,
    loseSetReply: false,
    error: "The turn did not start, and the thread was left in full-access mode.",
    modes: ["full-access"],
  },
  {
    name: "puts a stricter old mode back when the first mode set loses its reply",
    previous: "approval-required",
    next: "full-access",
    refuseRestore: false,
    loseSetReply: true,
    error: "reply lost",
    modes: ["full-access", "approval-required"],
  },
  {
    name: "puts auto back when a switch to full access fails",
    previous: "auto",
    next: "full-access",
    refuseRestore: false,
    loseSetReply: false,
    error: "dispatch refused",
    modes: ["full-access", "auto"],
  },
  {
    name: "keeps the stricter mode when the old one was auto",
    previous: "auto",
    next: "approval-required",
    refuseRestore: false,
    loseSetReply: false,
    error: "dispatch refused",
    modes: ["approval-required"],
  },
] as const)("a failed turn after a mode change $name", async (row) => {
  engine.modes.length = 0;
  engine.refuseRestore = row.refuseRestore;
  engine.loseSetReply = row.loseSetReply;
  const turn = runStartTurn({
    threadId: ThreadId.make("t"),
    message: { messageId: MessageId.make("m"), role: "user", text: "", attachments: [] },
    runtimeMode: row.next,
    interactionMode: "default",
    previousRuntimeMode: row.previous,
  }).pipe(
    Effect.flip,
    Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, unused),
    Effect.provideService(SecureRandom.SecureRandom, unused),
  );
  const error = await turn.pipe(Effect.runPromise);
  expect(error instanceof Error ? error.message : error).toBe(row.error);
  expect(engine.modes).toEqual(row.modes);
});
