import { useAtomValue } from "@effect/atom-react";
import {
  resolveProviderSkillsForCwd,
  resolveProvidersForCwd,
} from "@t3tools/client-runtime/providerSkills";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { ServerProviderSkill } from "@t3tools/contracts";
import { createContext, useMemo } from "react";

import { engineProvidersAtom } from "../state/server";
import { agentSkillsAtom, mergeSkills } from "./agentSkills";

const NO_SKILLS: ReadonlyArray<ServerProviderSkill> = [];

export const SkillsContext = createContext<ReadonlyArray<ServerProviderSkill>>(NO_SKILLS);

/** The skills of the provider instance a thread runs on, which a `$name` in a message can name. */
export function useThreadSkills(
  project: EnvironmentProject,
  instanceId: string | undefined,
): ReadonlyArray<ServerProviderSkill> {
  const providers = useAtomValue(engineProvidersAtom);
  const { workspaceRoot: cwd } = project;
  const agents = useAtomValue(agentSkillsAtom(cwd));
  return useMemo(() => {
    const provider = resolveProvidersForCwd(providers, cwd).find(
      (entry) => entry.instanceId === instanceId,
    );
    return mergeSkills(
      provider === undefined ? NO_SKILLS : resolveProviderSkillsForCwd(provider, cwd),
      agents,
    );
  }, [providers, cwd, instanceId, agents]);
}
