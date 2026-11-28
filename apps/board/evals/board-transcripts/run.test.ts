import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import { expect, it } from "vite-plus/test";

import { CASES } from "./cases";
import { checkTranscript } from "./check";

it.each(CASES)("$thread", ({ thread, expected }) => {
  const path = NodeURL.fileURLToPath(new URL(`fixture/${thread}`, import.meta.url));
  const lines = () => {
    try {
      return checkTranscript(NodeFS.existsSync(path) ? path : `${path}.json`);
    } catch (error) {
      return [String(error)];
    }
  };
  expect(lines()).toEqual(expected);
});
