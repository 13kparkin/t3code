import { describe, expect, it } from "vite-plus/test";

import { checkPhoneFirewall, firewallVerdict } from "./phoneFirewall.ts";
import type { ProcessRunner, RunResult } from "./wslEngine.ts";

// What FIREWALL_QUERY printed on a mirrored-WSL PC with the phone rule already added.
const WITH_RULE =
  '{"DefaultInboundAction":"Block","Rules":[{"Enabled":"True","Action":"Allow","Protocol":"TCP","LocalPorts":["3773"]},{"Enabled":"True","Action":"Allow","Protocol":"ICMPv4","LocalPorts":["3","11"]},{"Enabled":"True","Action":"Allow","Protocol":"UDP","LocalPorts":["5353"]}]}';
const ONE_ICMP_RULE =
  '{"DefaultInboundAction":"Block","Rules":{"Enabled":"True","Action":"Allow","Protocol":"ICMPv4","LocalPorts":["3","11"]}}';

describe("reading the Hyper-V firewall for the phone", () => {
  it.each([
    ["an allow rule on the port", WITH_RULE, 3773, { kind: "open" }],
    ["an allow rule on another port", WITH_RULE, 3774, { kind: "blocked", port: 3774 }],
    [
      "only an ICMP rule, written as a lone object",
      ONE_ICMP_RULE,
      3773,
      { kind: "blocked", port: 3773 },
    ],
    [
      "a disabled rule on the port",
      WITH_RULE.replace(
        '"Enabled":"True","Action":"Allow","Protocol":"TCP"',
        '"Enabled":"False","Action":"Allow","Protocol":"TCP"',
      ),
      3773,
      { kind: "blocked", port: 3773 },
    ],
    ["a port range rule", WITH_RULE.replace('["3773"]', '["3000-4000"]'), 3774, { kind: "open" }],
    [
      "inbound allowed by default",
      '{"DefaultInboundAction":"Allow","Rules":[]}',
      3773,
      { kind: "open" },
    ],
    ["output that is not the query's JSON", "Access is denied.", 3773, { kind: "not_applicable" }],
  ])("Given %s, then the verdict matches", (_name, json, port, verdict) => {
    expect(firewallVerdict(json, port)).toEqual(verdict);
  });
});

describe("when the phone firewall check runs", () => {
  const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: "" });
  const check = (
    overrides: {
      platform?: NodeJS.Platform;
      engineUrl?: string;
      mode?: () => Promise<RunResult>;
      query?: () => Promise<RunResult>;
    } = {},
  ) => {
    const runner: ProcessRunner = {
      run: overrides.query ?? (() => Promise.resolve(ok(ONE_ICMP_RULE))),
      start: () => {
        throw new Error("must not start");
      },
    };
    return checkPhoneFirewall({
      platform: overrides.platform ?? "win32",
      engineUrl: overrides.engineUrl,
      host: { exec: overrides.mode ?? (() => Promise.resolve(ok("mirrored\n"))) },
      runner,
      port: 3773,
    });
  };

  it.each([
    ["Linux", { platform: "linux" as const }, { kind: "not_applicable" }],
    ["a remote engine", { engineUrl: "http://pc:3773" }, { kind: "not_applicable" }],
    ["NAT networking", { mode: () => Promise.resolve(ok("nat\n")) }, { kind: "not_applicable" }],
    [
      "a query PowerShell refuses",
      { query: () => Promise.resolve({ exitCode: 1, stdout: "", stderr: "denied" }) },
      { kind: "not_applicable" },
    ],
    [
      "WSL that cannot start",
      { mode: () => Promise.reject(new Error("no wsl")) },
      { kind: "not_applicable" },
    ],
    ["mirrored WSL with no rule for the port", {}, { kind: "blocked", port: 3773 }],
  ])("Given %s, then the verdict is %j", async (_name, overrides, expected) => {
    expect(await check(overrides)).toEqual(expected);
  });
});
