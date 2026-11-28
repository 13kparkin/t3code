import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type PhoneFirewall, WSL_VM_CREATOR_ID } from "../src/settings/phoneFirewall.ts";
import type { LinuxHost, ProcessRunner } from "./wslEngine.ts";

const Rule = Schema.Struct({
  Enabled: Schema.String,
  Action: Schema.String,
  Protocol: Schema.String,
  LocalPorts: Schema.Array(Schema.String),
});
const Snapshot = Schema.Struct({
  DefaultInboundAction: Schema.String,
  // PowerShell 5 writes a one-element array as the element itself.
  Rules: Schema.Union([Schema.Array(Rule), Rule]),
});
const decodeSnapshot = Schema.decodeUnknownOption(Schema.fromJsonString(Snapshot));

/** Reads, never changes: the WSL VM's default inbound action and its inbound rules, with enums as names. */
export const FIREWALL_QUERY = [
  `$id = '${WSL_VM_CREATOR_ID}'`,
  "$s = Get-NetFirewallHyperVVMSetting -PolicyStore ActiveStore -Name $id",
  '$r = @(Get-NetFirewallHyperVRule -VMCreatorId $id -Direction Inbound -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ Enabled = "$($_.Enabled)"; Action = "$($_.Action)"; Protocol = "$($_.Protocol)"; LocalPorts = @($_.LocalPorts | ForEach-Object { "$_" }) } })',
  '[pscustomobject]@{ DefaultInboundAction = "$($s.DefaultInboundAction)"; Rules = $r } | ConvertTo-Json -Depth 4 -Compress',
].join("; ");

const coversPort = (ports: ReadonlyArray<string>, port: number) =>
  ports.some((entry) => {
    if (entry === "Any") return true;
    const [low, high] = entry.split("-").map(Number);
    return low !== undefined && port >= low && port <= (high ?? low);
  });

/** Blocked when inbound defaults to Block and no enabled Allow rule takes TCP on the port. Unreadable output says nothing. */
export function firewallVerdict(json: string, port: number): PhoneFirewall {
  const snapshot = Option.getOrNull(decodeSnapshot(json));
  if (snapshot === null) return { kind: "not_applicable" };
  if (snapshot.DefaultInboundAction !== "Block") return { kind: "open" };
  const rules = Array.isArray(snapshot.Rules) ? snapshot.Rules : [snapshot.Rules];
  const allowed = rules.some(
    (rule) =>
      rule.Enabled === "True" &&
      rule.Action === "Allow" &&
      (rule.Protocol === "TCP" || rule.Protocol === "Any") &&
      coversPort(rule.LocalPorts, port),
  );
  return allowed ? { kind: "open" } : { kind: "blocked", port };
}

/** Only an engine the board runs in WSL with mirrored networking sits behind the Hyper-V firewall. */
export async function checkPhoneFirewall(deps: {
  readonly platform: NodeJS.Platform;
  readonly engineUrl: string | undefined;
  readonly host: Pick<LinuxHost, "exec">;
  readonly runner: ProcessRunner;
  readonly port: number;
}): Promise<PhoneFirewall> {
  if (deps.platform !== "win32" || deps.engineUrl !== undefined) return { kind: "not_applicable" };
  try {
    const mode = await deps.host.exec(["wslinfo", "--networking-mode"], { timeoutMs: 10_000 });
    if (mode.stdout.trim() !== "mirrored") return { kind: "not_applicable" };
    const result = await deps.runner.run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", FIREWALL_QUERY],
      { timeoutMs: 10_000 },
    );
    return result.exitCode === 0
      ? firewallVerdict(result.stdout, deps.port)
      : { kind: "not_applicable" };
  } catch {
    return { kind: "not_applicable" };
  }
}
