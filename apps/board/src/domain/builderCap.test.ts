import { describe, expect, it } from "vite-plus/test";

import { parseBuilderCap, suggestedBuilders } from "./builderCap";

const GIB = 1024 ** 3;

describe("parseBuilderCap", () => {
  it.each([
    ["1", 1],
    [" 16 ", 16],
    ["0", null],
    ["17", null],
    ["2.5", null],
    ["-1", null],
    ["", null],
    ["abc", null],
  ])("%j gives %j", (text, cap) => {
    expect(parseBuilderCap(text)).toBe(cap);
  });
});

describe("suggestedBuilders", () => {
  it.each([
    [{ availableMemoryBytes: 20 * GIB, cpuCount: 16 }, 5],
    [{ availableMemoryBytes: 64 * GIB, cpuCount: 4 }, 3],
    [{ availableMemoryBytes: 1 * GIB, cpuCount: 8 }, 1],
    [{ availableMemoryBytes: 512 * GIB, cpuCount: 128 }, 16],
    [{ availableMemoryBytes: 64 * GIB, cpuCount: 1 }, 1],
  ])("%j gives %j", (host, suggested) => {
    expect(suggestedBuilders(host)).toBe(suggested);
  });
});
