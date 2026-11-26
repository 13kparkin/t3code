import { describe, expect, it } from "vite-plus/test";

import { foldBoardScan } from "./boardScan";

describe("foldBoardScan", () => {
  it("lists a project whose folder is gone beside the others", () => {
    expect(
      foldBoardScan(["a", "gone", "c"], [true, new Error("workspace_root_not_found"), false]),
    ).toEqual([
      { project: "a", error: null },
      { project: "gone", error: "workspace_root_not_found" },
    ]);
  });

  it("fails the whole scan when no project answers", () => {
    const lost = new Error("Connection lost.");
    expect(foldBoardScan(["a", "b"], [lost, new Error("Connection lost.")])).toBe(lost);
  });
});
