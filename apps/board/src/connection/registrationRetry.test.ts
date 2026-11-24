import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { describe, expect, it } from "vite-plus/test";

import { REGISTRATION_RETRY } from "./registrationRetry";

describe("describing the engine at startup", () => {
  it("Given an engine that stays down for five minutes, when the board keeps asking, then it registers once the engine answers", async () => {
    const attempts = await Effect.gen(function* () {
      const count = yield* Ref.make(0);
      const describe = Effect.gen(function* () {
        const elapsed = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
        yield* Ref.update(count, (value) => value + 1);
        if (elapsed < 5 * 60_000) return yield* Effect.fail("engine down");
        return "registered";
      });
      const fiber = yield* Effect.forkChild(Effect.retry(describe, REGISTRATION_RETRY));
      yield* TestClock.adjust("6 minutes");
      expect(yield* Fiber.join(fiber)).toBe("registered");
      return yield* Ref.get(count);
    }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise);
    // At 0, 1, 3, 7, 15 and 31 s, then every 30 s until 301 s.
    expect(attempts).toBe(15);
  });
});
