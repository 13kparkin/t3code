import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { useContext, useState } from "react";

import { buttonClass } from "./controls/buttonClass";
import { hyperVRuleCommand, type PhoneFirewall } from "./phoneFirewall";
import { SettingsRow } from "./SettingsRow";

/** Read again each time the page opens, since the user fixes the rule outside the app. */
const firewallAtom = Atom.family((port: number) =>
  Atom.make((get): PhoneFirewall | null => {
    void window.board?.phoneFirewall(port).then(
      (next) => get.setSelf(next),
      () => get.setSelf({ kind: "not_applicable" }),
    );
    return null;
  }).pipe(Atom.withLabel(`phone-firewall:${port}`)),
);

/** Warns when the Hyper-V firewall keeps phones from the engine in WSL, with the command that lets them in. */
export function FirewallRow({ port }: { port: number }) {
  const registry = useContext(RegistryContext);
  const state = useAtomValue(firewallAtom(port));
  const [copied, setCopied] = useState(false);
  if (state?.kind !== "blocked") return null;
  const command = hyperVRuleCommand(state.port);
  return (
    <SettingsRow
      title="The PC's firewall blocks phones"
      description={`The engine runs in WSL with mirrored networking, and the Hyper-V firewall blocks incoming connections to port ${state.port}. Open PowerShell as administrator on the PC, run this command, then press Check again.`}
      control={
        <button
          type="button"
          onClick={() => registry.refresh(firewallAtom(port))}
          className={buttonClass}
        >
          Check again
        </button>
      }
    >
      <div role="alert" className="flex items-start gap-2">
        <code className="min-w-0 flex-1 rounded-md border border-line bg-bg p-2 font-mono text-xs break-all text-fg">
          {command}
        </code>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(command).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
          className={buttonClass}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </SettingsRow>
  );
}
