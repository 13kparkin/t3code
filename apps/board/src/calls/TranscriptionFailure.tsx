import { RegistryContext } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useContext } from "react";

import { transcribeCall } from "../state/recorder";
import { settingsPageAtom } from "../state/settingsPage";
import type { Transcription } from "./recorder";

const BUTTON = "shrink-0 rounded px-1.5 text-faint hover:bg-hover hover:text-fg";

export function TranscriptionFailure({
  project,
  folder,
  callId,
  job,
}: {
  project: Pick<EnvironmentProject, "environmentId" | "workspaceRoot">;
  folder: string;
  callId: string;
  job: Extract<Transcription, { status: "failed" }>;
}) {
  const registry = useContext(RegistryContext);
  return (
    <div role="alert" className="flex items-start gap-1 text-[11px] text-red-400">
      <p className="min-w-0 flex-1 break-words">{job.message}</p>
      {job.missingModel && (
        <button
          type="button"
          onClick={() => registry.set(settingsPageAtom, "voice")}
          className={BUTTON}
        >
          Voice settings
        </button>
      )}
      <button
        type="button"
        onClick={() => void transcribeCall(registry, project, folder, callId)}
        className={BUTTON}
      >
        Try again
      </button>
    </div>
  );
}
