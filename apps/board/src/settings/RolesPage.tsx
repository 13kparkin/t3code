import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useContext, useState } from "react";

import { ModelPicker } from "../chat/ModelPicker";
import { DefaultOrchestratorSection } from "./DefaultOrchestratorSection";
import type { RoleOverride } from "../domain/board";
import { ROLES, roleTargetProblem } from "../orchestrator/roles";
import { lastOpenedBoardAtom } from "../state/boards";
import { environmentSnapshotAtom } from "../state/projects";
import { activeBoardsAtom, boardInstance, saveRoleTarget } from "../state/roleTargets";
import { engineProvidersAtom } from "../state/server";
import { Select } from "./controls/Select";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

const firstSentence = (text: string) => (text.split(/(?<=\.)\s/)[0] ?? text).replace(/\.?$/, ".");

/** Each role's model and effort on one board, saved in `board.json`. */
export function RolesPage({ environmentId }: { environmentId: EnvironmentId }) {
  const registry = useContext(RegistryContext);
  const boards = useAtomValue(activeBoardsAtom);
  const lastOpened = useAtomValue(lastOpenedBoardAtom);
  const providers = useAtomValue(engineProvidersAtom);
  const threads = useAtomValue(environmentSnapshotAtom(environmentId))?.threads;
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const keyOf = (choice: (typeof boards)[number]) => `${choice.project.id}/${choice.listed.folder}`;
  const wanted =
    picked ?? (lastOpened === null ? null : `${lastOpened.projectId}/${lastOpened.folder}`);
  const choice = boards.find((entry) => keyOf(entry) === wanted) ?? boards[0];
  if (choice === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <DefaultOrchestratorSection />
        <p className="text-faint">No board yet. Create one from a project's + to set its roles.</p>
      </div>
    );
  }

  const { board } = choice.listed;
  const instance = boardInstance(providers, threads, board.orchestratorThreadId);
  const save = (role: string, target: RoleOverride | null) => {
    setStatus("Saving…");
    void saveRoleTarget(
      registry,
      choice.project,
      choice.listed.folder,
      role,
      target,
      instance,
    ).then((problem) => setStatus(problem ?? "Saved"));
  };

  return (
    <div className="flex flex-col gap-6">
      <DefaultOrchestratorSection />
      <SettingsSection
        title="Roles"
        clip={false}
        note="An agent the orchestrator starts after a change runs on the new model. Agents already running keep theirs. You can also ask the orchestrator in chat to change a role."
      >
        <SettingsRow
          title="Board"
          description={
            instance === null
              ? "No provider is running, so models cannot be picked."
              : `Models from ${instance.name}.`
          }
          control={
            <span className="flex items-center gap-3">
              <span role="status" className="text-xs text-faint">
                {status}
              </span>
              <Select
                label="Board"
                value={keyOf(choice)}
                options={boards.map((entry) => ({
                  value: keyOf(entry),
                  title: `${entry.project.title} / ${entry.listed.board.name}`,
                }))}
                onChange={(next) => {
                  setStatus("");
                  setPicked(next);
                }}
              />
            </span>
          }
        />
        {ROLES.map((role) => {
          const own = board.roleTargets?.[role.name];
          const shown = own ?? { model: role.model.slug, effort: role.model.effort };
          const problem =
            own === undefined || instance === null
              ? null
              : roleTargetProblem(role.name, own, instance);
          return (
            <SettingsRow
              key={role.name}
              title={role.name}
              description={`${firstSentence(role.description)} Default: ${role.model.slug} at ${role.model.effort}.`}
              origin={{ inherited: own === undefined, onReset: () => save(role.name, null) }}
              control={
                <ModelPicker
                  dropDown
                  instances={instance === null ? [] : [instance]}
                  value={{
                    instanceId: instance?.instanceId ?? "",
                    model: shown.model,
                    effort: shown.effort ?? "",
                  }}
                  onChange={(next) =>
                    save(role.name, {
                      model: next.model,
                      ...(next.effort === "" ? {} : { effort: next.effort }),
                    })
                  }
                  switchBlocked={null}
                  open={open === role.name}
                  onOpenChange={(next) => setOpen(next ? role.name : null)}
                />
              }
            >
              {problem !== null && (
                <p role="alert" className="text-xs text-red-400">
                  {problem}
                </p>
              )}
            </SettingsRow>
          );
        })}
      </SettingsSection>
    </div>
  );
}
