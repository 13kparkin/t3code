import * as NodeURL from "node:url";

import { expect, it } from "vite-plus/test";

import { CASES } from "./cases";
import { checkClaims } from "./check";

const problems = checkClaims(NodeURL.fileURLToPath(new URL("fixture/", import.meta.url)));

it.each(CASES)("$ticket", ({ ticket, expected }) => {
  expect(problems.filter((line) => line.startsWith(`${ticket} `))).toEqual(expected);
});

it("lists nothing beyond the cases", () => {
  expect(problems).toEqual(CASES.flatMap((entry) => entry.expected));
});
