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
import { isPhone, PHONE_LABEL, phoneEndpoint, phonePairingUrl } from "./phonePairing";
import { PairingLink } from "./PairingLink";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

export function PhonePage({ environmentId }: { environmentId: EnvironmentId }) {
  const registry = useContext(RegistryContext);
  const access = useAtomValue(authEnvironment.accessChanges({ environmentId, input: null }));
  const event = AsyncResult.getOrElse(access, () => null);
  const snapshot = event?.type === "snapshot" ? event.payload : null;
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const endpoint = phoneEndpoint(config?.directEndpoints);
  // The credential stays in this page's memory only: never logged, stored, or written to a board file.
  const [created, setCreated] = useState<{
    id: string;
    credential: string;
    expiresAt: number;
  } | null>(null);
  const [pairing, setPairing] = useState(false);
  const [revoking, setRevoking] = useState<AuthSessionId | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The engine drops the link from the snapshot once a phone uses it.
  const live = created !== null && snapshot?.pairingLinks.some((link) => link.id === created.id);
  const phones = snapshot?.clientSessions.filter(isPhone) ?? [];

  const pair = async () => {
    setPairing(true);
    setFailure(null);
    const result = await runAtomCommand(
      registry,
      authEnvironment.createPairingCredential,
      { environmentId, input: { label: PHONE_LABEL } },
      { reportFailure: false },
    );
    setPairing(false);
    if (result._tag === "Success") {
      // The page shows only the newest link, so the one it replaces stops working too.
      if (live) {
        void runAtomCommand(
          registry,
          authEnvironment.revokePairingLink,
          { environmentId, input: { id: created.id } },
          { reportFailure: false },
        );
      }
      setCreated({
        id: result.value.id,
        credential: result.value.credential,
        expiresAt: DateTime.toEpochMillis(result.value.expiresAt),
      });
    } else setFailure(failureText(result));
  };

  const revoke = async (sessionId: AuthSessionId) => {
    setRevoking(sessionId);
    setFailure(null);
    const result = await runAtomCommand(
      registry,
      authEnvironment.revokeClient,
      { environmentId, input: { sessionId } },
      { reportFailure: false },
    );
    setRevoking(null);
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
            config === null
              ? "Reading the engine's addresses."
              : endpoint === undefined
                ? "The engine listens only on this PC, so a phone cannot reach it. Turn on network access in T3 Code's Settings, Connections."
                : endpoint.kind === "lan"
                  ? "Makes a one-time link through the engine. On this local network address the link and the phone's session travel unencrypted. A Tailscale address encrypts them."
                  : "Makes a one-time link through the engine."
          }
          control={
            <button
              type="button"
              disabled={pairing || endpoint === undefined}
              onClick={() => void pair()}
              className={buttonClass}
            >
              {pairing ? "Creating…" : live ? "New link" : "Pair a phone"}
            </button>
          }
        >
          {live && endpoint !== undefined && (
            <PairingLink
              key={created.id}
              url={phonePairingUrl(endpoint, created.credential)}
              expiresAt={created.expiresAt}
              onFailure={setFailure}
            />
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
                  disabled={revoking === phone.sessionId}
                  onClick={() => void revoke(phone.sessionId)}
                  className={buttonClass}
                >
                  {revoking === phone.sessionId ? "Revoking…" : "Revoke"}
                </button>
              }
            />
          ))
        )}
      </SettingsSection>
    </div>
  );
}
