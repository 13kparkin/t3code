import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useContext } from "react";

import {
  installSpeechModel,
  modelInstalled,
  speechCheckAtom,
  speechInstallAtom,
  speechStatusAtom,
} from "../state/speech";
import { buttonClass } from "./controls/buttonClass";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

export function VoicePage({ environmentId }: { environmentId: EnvironmentId }) {
  const registry = useContext(RegistryContext);
  const error = useAtomValue(speechCheckAtom(environmentId));
  const status = useAtomValue(speechStatusAtom);
  const install = useAtomValue(speechInstallAtom);

  return (
    <SettingsSection
      title="Call transcription"
      note="The board transcribes calls with this model on your engine. The audio goes nowhere else."
    >
      {error !== null ? (
        <p role="alert" className="px-3 py-2.5 break-words text-red-400">
          {error}
        </p>
      ) : status === null ? (
        <p className="px-3 py-2.5 text-faint">Reading the engine's speech status.</p>
      ) : !status.supported ? (
        <p className="px-3 py-2.5 text-faint">{status.reason}</p>
      ) : (
        <SettingsRow
          title={status.model}
          description={`${modelInstalled(status) ? "Installed" : "Not installed"} · ${Math.round(status.size / 1024 / 1024)} MB`}
          control={
            modelInstalled(status) ? null : (
              <button
                type="button"
                disabled={install.status === "installing"}
                onClick={() => void installSpeechModel(registry, environmentId, status.modelId)}
                className={buttonClass}
              >
                {install.status === "installing" ? "Installing…" : "Install"}
              </button>
            )
          }
        >
          {install.status === "failed" && (
            <p role="alert" className="text-xs break-words text-red-400">
              {install.message}
            </p>
          )}
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
