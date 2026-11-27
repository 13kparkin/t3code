import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { useContext, useState } from "react";

import type { NetworkAccess } from "../connection/engineState";
import { buttonClass } from "./controls/buttonClass";
import { Switch } from "./controls/Switch";
import { SettingsRow } from "./SettingsRow";

const bridge = window.board;

/** Read again each time the page opens, since `t3 up` in a terminal can change it too. */
const networkAccessAtom = Atom.writable(
  (get): NetworkAccess | null => {
    void bridge?.networkAccess().then((access) => get.setSelf(access));
    return null;
  },
  (context, next: NetworkAccess | null) => context.setSelf(next),
).pipe(Atom.withLabel("network-access"));

/** The switch that lets phones reach T3's service, through T3's own `t3 up --lan`. */
export function NetworkAccessRow() {
  const registry = useContext(RegistryContext);
  const access = useAtomValue(networkAccessAtom);
  const [asking, setAsking] = useState<boolean | null>(null);
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const apply = async (enabled: boolean) => {
    setAsking(null);
    setFailure(null);
    setApplying(true);
    const next = await bridge?.setNetworkAccess(enabled);
    setApplying(false);
    if (next?.ok === true) registry.set(networkAccessAtom, next);
    else if (next !== undefined) setFailure(next.detail);
  };

  if (bridge === undefined) return null;
  const enabled = access?.ok === true && access.enabled;
  return (
    <SettingsRow
      title="Network access"
      description={
        access === null
          ? "Reading T3's service settings."
          : !access.ok
            ? access.detail
            : access.hostOverride !== null
              ? `T3CODE_HOST=${access.hostOverride} in T3's service.env sets where the engine listens, and wins over this switch.`
              : `${access.enabled ? "On. Devices on your local network and tailnet can reach the engine." : "Off. On lets devices on your local network and tailnet reach the engine."} Each phone still needs a pairing link. On a local network address the link and the session travel unencrypted. A Tailscale address encrypts them.`
      }
      control={
        <Switch
          label="Network access"
          checked={asking ?? enabled}
          disabled={
            applying || asking !== null || access?.ok !== true || access.hostOverride !== null
          }
          onChange={setAsking}
        />
      }
    >
      {asking !== null && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-fg">
            This restarts T3's service, which stops every running agent turn, the orchestrator's
            too.
          </span>
          <button type="button" onClick={() => void apply(asking)} className={buttonClass}>
            {asking ? "Restart and turn on" : "Restart and turn off"}
          </button>
          <button type="button" onClick={() => setAsking(null)} className={buttonClass}>
            Cancel
          </button>
        </div>
      )}
      {applying && <p className="text-xs text-faint">Restarting T3's service.</p>}
      {failure !== null && (
        <p role="alert" className="text-xs break-words text-red-400">
          {failure}
        </p>
      )}
    </SettingsRow>
  );
}
