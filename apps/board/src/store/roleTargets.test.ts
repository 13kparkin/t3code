import { describe, expect, it } from "vite-plus/test";

import { openRoleTargets } from "./roleTargets";

const target = (id: string, createdAt: string, model: string) =>
  JSON.stringify({
    id,
    kind: "role_target",
    title: id,
    body: "",
    status: "open",
    createdAt,
    write: { role: "reviewer", model },
  });

describe("open role_target requests", () => {
  it("Given two requests for one role, when read, then they come oldest first, so the newer one is applied last and wins", () => {
    const text = [
      target("rt-old", "2026-11-21T10:00:00Z", "old-model"),
      target("rt-new", "2026-11-21T10:05:00Z", "new-model"),
    ].join("\n");
    expect(openRoleTargets(text, {}).map((item) => item.id)).toEqual(["rt-old", "rt-new"]);
  });

  it("Given two requests at the same time, when read, then file order holds, so the later line wins", () => {
    const text = [
      target("rt-first", "2026-11-21T10:00:00Z", "first-model"),
      target("rt-second", "2026-11-21T10:00:00Z", "second-model"),
    ].join("\n");
    expect(openRoleTargets(text, {}).map((item) => item.id)).toEqual(["rt-first", "rt-second"]);
  });
});
