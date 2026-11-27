import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { AuthSessionId, EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { AsyncResult } from "effect/reactivity";
import { useContext, useState } from "react";

import { authEnvironment } from "../state/auth";
import { serverEnvironment } from "../state/server";
import { buttonClass } from "./controls/buttonClass";
import { failureText } from "./failureText";
import { isPhone, PHONE_LABEL, phonePairingUrl } from "./phonePairing";
import { QrCodeSvg } from "./QrCodeSvg";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

export function PhonePage({ environmentId }: { environmentId: EnvironmentId }) {
  const registry = useContext(RegistryContext);
  const access = useAtomValue(authEnvironment.accessChanges({ environmentId, input: null }));
  const event = AsyncResult.getOrElse(access, () => null);
  const snapshot = event?.type === "snapshot" ? event.payload : null;
  const endpoints = useAtomValue(serverEnvironment.configValueAtom(environmentId))?.directEndpoints;
  // The credential stays in this page's memory only: never logged, stored, or written to a board file.
  const [created, setCreated] = useState<{ id: string; credential: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The engine drops the link from the snapshot once a phone uses it or it expires.
  const live = created !== null && snapshot?.pairingLinks.some((link) => link.id === created.id);
  const url = live ? phonePairingUrl(endpoints, created.credential) : null;
  const phones = snapshot?.clientSessions.filter(isPhone) ?? [];

  const pair = async () => {
    setBusy("pair");
    setFailure(null);
    setCopied(false);
    const result = await runAtomCommand(
      registry,
      authEnvironment.createPairingCredential,
      { environmentId, input: { label: PHONE_LABEL } },
      { reportFailure: false },
    );
    setBusy(null);
    if (result._tag === "Success") {
      setCreated({ id: result.value.id, credential: result.value.credential });
    } else setFailure(failureText(result));
  };

  const revoke = async (sessionId: AuthSessionId) => {
    setBusy(sessionId);
    setFailure(null);
    const result = await runAtomCommand(
      registry,
      authEnvironment.revokeClient,
      { environmentId, input: { sessionId } },
      { reportFailure: false },
    );
    setBusy(null);
    if (result._tag !== "Success") setFailure(failureText(result));
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Pair a phone"
        note="Open Agent Board on the phone and scan the code, or paste the link. The link works once."
      >
        <SettingsRow
          title="Pairing link"
          description={
            live && url === null
              ? "The engine listens only on this PC, so a phone cannot reach it. Turn on network access in T3 Code's Settings, Connections, then pair again."
              : live
                ? "Scan it with the phone's Scan QR code."
                : "Makes a one-time link through the engine."
          }
          control={
            <button
              type="button"
              disabled={busy === "pair"}
              onClick={() => void pair()}
              className={buttonClass}
            >
              {busy === "pair" ? "Creating…" : live ? "New link" : "Pair a phone"}
            </button>
          }
        >
          {url !== null && (
            <div className="flex items-end gap-3">
              <QrCodeSvg value={url} title="Pairing link for the phone" />
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
                className={buttonClass}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          {failure !== null && (
            <p role="alert" className="text-xs break-words text-red-400">
              {failure}
            </p>
          )}
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Paired phones">
        {AsyncResult.isFailure(access) ? (
          <p role="alert" className="px-3 py-2.5 text-red-400">
            The engine did not list its sessions. This board's session may not manage access.
          </p>
        ) : snapshot === null ? (
          <p className="px-3 py-2.5 text-faint">Reading the engine's sessions.</p>
        ) : phones.length === 0 ? (
          <p className="px-3 py-2.5 text-faint">No phone is paired.</p>
        ) : (
          phones.map((phone) => (
            <SettingsRow
              key={phone.sessionId}
              title={phone.client.label ?? "Phone"}
              description={
                phone.connected
                  ? "Connected"
                  : phone.lastConnectedAt === null
                    ? "Never connected"
                    : `Last connected ${new Date(DateTime.toEpochMillis(phone.lastConnectedAt)).toLocaleString()}`
              }
              control={
                <button
                  type="button"
                  disabled={busy === phone.sessionId}
                  onClick={() => void revoke(phone.sessionId)}
                  className={buttonClass}
                >
                  {busy === phone.sessionId ? "Revoking…" : "Revoke"}
                </button>
              }
            />
          ))
        )}
      </SettingsSection>
    </div>
  );
}
