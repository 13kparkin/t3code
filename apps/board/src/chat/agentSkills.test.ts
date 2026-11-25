import type { ServerProviderSkill } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mergeSkills, parseAgentSkills } from "./agentSkills";

const file = (path: string, head: string) => `\u001e${path}\n${head}`;
const CLAUDE = "/h/.claude/skills/simplify/SKILL.md";
const claude: ServerProviderSkill = { name: "simplify", path: CLAUDE, enabled: true };

describe("merging .agents skills into the provider's", () => {
  it.each([
    {
      name: "a home skill",
      listing: file(
        "/h/.agents/skills/how/SKILL.md",
        "---\nname: how\ndescription: Explain\n---\n",
      ),
      result: [
        ["simplify", CLAUDE],
        ["how", "/h/.agents/skills/how/SKILL.md"],
      ],
    },
    {
      name: "the same skill in the project and the home",
      listing:
        file("/p/.agents/skills/how/SKILL.md", "---\nname: how\n---\n") +
        file("/h/.agents/skills/how/SKILL.md", "---\nname: how\n---\n"),
      result: [
        ["simplify", CLAUDE],
        ["how", "/p/.agents/skills/how/SKILL.md"],
      ],
    },
    {
      name: "an .agents skill the provider also lists",
      listing: file("/h/.agents/skills/simplify/SKILL.md", "---\nname: simplify\n---\n"),
      result: [["simplify", CLAUDE]],
    },
    { name: "no listing", listing: "", result: [["simplify", CLAUDE]] },
  ])("Given $name, then the menu lists $result", ({ listing, result }) => {
    const merged = mergeSkills([claude], parseAgentSkills(listing));
    expect(merged.map((skill) => [skill.name, skill.path])).toEqual(result);
  });

  it("Given a folded description, as ~/.agents/skills/computer-use writes it, then the menu reads its text", () => {
    const head = [
      "---",
      "name: computer-use",
      "description: >-",
      "  Drives the GUI of a visible local app window through `orca computer`: accessibility",
      "  tree, clicks, typing, menus, dialogs, and screenshots.",
      "---",
      "",
    ].join("\n");
    const [skill] = parseAgentSkills(file("/h/.agents/skills/computer-use/SKILL.md", head));
    expect(skill?.description).toBe(
      "Drives the GUI of a visible local app window through `orca computer`: accessibility tree, clicks, typing, menus, dialogs, and screenshots.",
    );
  });
});
