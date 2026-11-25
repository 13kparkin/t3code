import { describe, expect, it } from "vite-plus/test";

import { composerPlacement } from "./composerPlacement";

describe("where the composer sits", () => {
  it.each([
    { threadShown: false, focused: false, filled: false, placement: "corner" },
    { threadShown: false, focused: true, filled: false, placement: "center" },
    { threadShown: false, focused: false, filled: true, placement: "center" },
    { threadShown: true, focused: false, filled: false, placement: "sidebar" },
    { threadShown: true, focused: true, filled: true, placement: "sidebar" },
  ] as const)(
    "Given thread shown $threadShown, focused $focused, filled $filled, then it sits at $placement",
    ({ placement, ...input }) => {
      expect(composerPlacement(input)).toBe(placement);
    },
  );
});
