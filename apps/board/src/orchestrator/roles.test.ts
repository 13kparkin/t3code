import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { resolveRoles, roleTargetProblem, ROLES } from "./roles";

const rolesDir = NodePath.resolve(import.meta.dirname, "../../roles");

describe("the role registry", () => {
  it("Given the registry, when it is read, then it is these 18 roles on these models", () => {
    const SONNET = ["claude-sonnet-5-5", "medium"];
    const OPUS = ["claude-opus-5-5", "medium"];
    expect(
      ROLES.map((role) => [
        role.name,
        role.t3Role,
        role.isolation,
        role.model.slug,
        role.model.effort,
      ]),
    ).toEqual([
      ["task", "implementation", "worktree", ...SONNET],
      ["scout", "research", "shared", ...SONNET],
      ["reviewer", "review", "shared", ...SONNET],
      ["security-reviewer", "review", "shared", "claude-opus-5-5", "high"],
      ["sonic", "implementation", "shared", "claude-haiku-5-5", "low"],
      ["verifier", "test", "shared", ...SONNET],
      ["comment-sicko", "review", "shared", ...OPUS],
      ["poteto-agent", "general", "worktree", ...OPUS],
      ["egm-bootstrap-orchestrator", "general", "worktree", ...OPUS],
      ["egm-codebase-details", "review", "shared", ...OPUS],
      ["egm-comprehension", "review", "shared", ...OPUS],
      ["egm-design", "design", "shared", ...OPUS],
      ["egm-implementation-readiness", "review", "shared", ...OPUS],
      ["egm-structural", "review", "shared", ...OPUS],
      ["egm-style", "review", "shared", ...OPUS],
      ["egm-synthesizer", "general", "shared", ...OPUS],
      ["egm-zoom-out", "design", "shared", ...OPUS],
      ["call-notes", "research", "shared", ...SONNET],
    ]);
  });

  it("Given every registry file, when roles/ is read, then each exists and names its own role", () => {
    for (const role of ROLES) {
      const text = NodeFS.readFileSync(NodePath.join(rolesDir, role.file), "utf8");
      expect(text.split("\n")[1]).toBe(`name: ${role.name}`);
    }
    expect(NodeFS.readdirSync(rolesDir).toSorted()).toEqual(
      ROLES.map((role) => role.file).toSorted(),
    );
  });

  it("Given no omp-only front matter keys, when roles/ is read, then none carries tools, model, spawns, or thinking-level", () => {
    for (const role of ROLES) {
      const text = NodeFS.readFileSync(NodePath.join(rolesDir, role.file), "utf8");
      const frontMatter = text.slice(0, text.indexOf("\n---\n", 4));
      expect(frontMatter).not.toMatch(/^(tools|model|spawns|thinking-level|output):/m);
    }
  });

  it("Given an instance that offers every model, when the roles resolve, then each keeps its own model on that instance", () => {
    const resolved = resolveRoles(ROLES, {
      instanceId: "claudeAgent",
      offered: ROLES.map((role) => role.model.slug),
    });
    expect(resolved.find((role) => role.name === "security-reviewer")).toMatchObject({
      target: { providerInstanceId: "claudeAgent", model: "claude-opus-5-5", effort: "high" },
      fallback: null,
    });
  });

  it("Given an instance without claude-haiku-5-5, when the roles resolve, then only sonic falls back and says why", () => {
    const resolved = resolveRoles(ROLES, {
      instanceId: "claudeAgent",
      offered: ["claude-opus-5-5", "claude-sonnet-5-5"],
    });
    const fallen = resolved.filter((role) => role.fallback !== null);
    expect(fallen.map((role) => role.name)).toEqual(["sonic"]);
    expect(fallen[0]).toMatchObject({
      target: { providerInstanceId: "claudeAgent" },
      fallback:
        "claude-haiku-5-5 is not offered by claudeAgent, so it uses the orchestrator's model",
    });
  });
});

describe("checking a role target", () => {
  const efforts = ["low", "medium", "high"].map((id) => ({ id, label: id }));
  const instance = {
    instanceId: "claudeAgent",
    offered: ["claude-opus-5-5"],
    models: [
      {
        slug: "claude-opus-5-5",
        name: "Opus",
        effort: { id: "effort", choices: efforts, defaultChoice: "medium" },
      },
    ],
  };

  it.each([
    ["reviewer", { model: "claude-opus-5-5", effort: "high" }, null],
    ["reviewer", { model: "claude-opus-5-5" }, null],
    ["nobody", { model: "claude-opus-5-5" }, "nobody is not a role in the registry."],
    ["reviewer", null, null],
    ["nobody", null, "nobody is not a role in the registry."],
    ["reviewer", { model: "claude-fable-5-2" }, "claudeAgent does not offer claude-fable-5-2."],
    [
      "reviewer",
      { model: "claude-opus-5-5", effort: "max" },
      "claude-opus-5-5 has no effort max. Pick one of low, medium, high.",
    ],
  ])("Given %s on %j, when checked, then the problem is %j", (role, pick, problem) => {
    expect(roleTargetProblem(role, pick, instance)).toBe(problem);
  });

  it("Given no provider, when checked, then it says nothing can be checked", () => {
    expect(roleTargetProblem("reviewer", { model: "claude-opus-5-5" }, null)).toBe(
      "No provider is running to check the model against.",
    );
  });
});
