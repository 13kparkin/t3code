import { expect, it } from "vite-plus/test";

import { CASES } from "./cases";
import { checkPrompt } from "./check";

it.each(CASES)("$id", ({ input, expected }) => {
  expect(checkPrompt(input)).toEqual(expected);
});
