import * as NodeURL from "node:url";

import { expect, it } from "vite-plus/test";

import { CASES } from "./cases";
import { checkTranscript } from "./check";

it.each(CASES)("$thread", ({ thread, expected }) => {
  expect(
    checkTranscript(NodeURL.fileURLToPath(new URL(`fixture/${thread}.json`, import.meta.url))),
  ).toEqual(expected);
});
