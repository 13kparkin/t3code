import { MessageId, ThreadId } from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { chatStream, codeSpans, shouldRetryHistory, userTurn } from "./chat";

describe("userTurn", () => {
  it("sends the literal text in the thread's own modes", () => {
    const text = `status?\n${"x".repeat(5_000)}`;
    expect(
      userTurn(
        { id: ThreadId.make("orch"), runtimeMode: "approval-required", interactionMode: "plan" },
        MessageId.make("m1"),
        text,
      ),
    ).toEqual({
      threadId: "orch",
      message: { messageId: "m1", role: "user", text, attachments: [] },
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
  });
});

describe("chatStream", () => {
  function setup() {
    const events: Array<string> = [];
    const stream = Atom.make((get) => {
      events.push("open");
      get.addFinalizer(() => events.push("close"));
      return "thread";
    });
    const registry = AtomRegistry.make();
    return { events, stream, registry };
  }

  it("closes the thread stream when the tab blurs and opens it again on focus", () => {
    // The registry removes an unmounted atom on a scheduled task, as with the engine's idle TTL of 0, so timers run before each remount.
    using _timers = { [Symbol.dispose]: () => vi.useRealTimers() };
    vi.useFakeTimers();
    const { events, stream, registry } = setup();
    const focused = registry.mount(chatStream(stream, true, true));
    expect(registry.get(chatStream(stream, true, true))).toBe("thread");
    focused();
    vi.runAllTimers();
    const blurred = registry.mount(chatStream(stream, false, true));
    expect(registry.get(chatStream(stream, false, true))).toBeNull();
    blurred();
    vi.runAllTimers();
    registry.mount(chatStream(stream, true, true));
    expect(events).toEqual(["open", "close", "open"]);
  });

  it("does not open the stream while the app is in the background", () => {
    const { events, stream, registry } = setup();
    registry.mount(chatStream(stream, true, false));
    expect(events).toEqual([]);
  });
});

describe("shouldRetryHistory", () => {
  it.each([
    ["a failed load, dragged at the top", "Request timed out.", 0, true],
    ["a failed load, dragged far below the top", "Request timed out.", 2_000, false],
    ["no failure, dragged at the top", null, 0, false],
  ] as const)("%s", (_case, error, top, retry) => {
    expect(shouldRetryHistory({ error }, top, 800)).toBe(retry);
  });
});

describe("codeSpans", () => {
  it.each([
    ["plain", [{ code: false, text: "plain" }]],
    [
      "run `vp test` now",
      [
        { code: false, text: "run " },
        { code: true, text: "vp test" },
        { code: false, text: " now" },
      ],
    ],
    [
      "see:\n```ts\nconst a = 1;\n```\ndone",
      [
        { code: false, text: "see:\n" },
        { code: true, text: "const a = 1;" },
        { code: false, text: "\ndone" },
      ],
    ],
    ["streaming ```ts\nconst a", [{ code: false, text: "streaming ```ts\nconst a" }]],
  ])("cuts %j", (text, spans) => {
    expect(codeSpans(text)).toEqual(spans);
  });
});
