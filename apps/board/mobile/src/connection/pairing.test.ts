import { describe, expect, it } from "vite-plus/test";

import { pairingErrorText, readPairingRequest } from "./pairing";

const LAN = "http://192.168.1.20:3773/pair#token=lan-code";
const TAILNET = "https://desktop.tail1234.ts.net/pair#token=tailnet-code";

describe("readPairingRequest", () => {
  it.each([
    ["a LAN URL", LAN, "http://192.168.1.20:3773/", "lan-code"],
    ["a Tailscale URL", TAILNET, "https://desktop.tail1234.ts.net/", "tailnet-code"],
    [
      "a QR payload with a trailing newline",
      `${TAILNET}\n`,
      "https://desktop.tail1234.ts.net/",
      "tailnet-code",
    ],
    [
      "a hosted pairing URL",
      "https://app.t3.codes/pair?host=https%3A%2F%2Fdesktop.tail1234.ts.net#token=hosted-code",
      "https://desktop.tail1234.ts.net/",
      "hosted-code",
    ],
    [
      "a T3 app link",
      `t3code://pair?pairingUrl=${encodeURIComponent(LAN)}`,
      "http://192.168.1.20:3773/",
      "lan-code",
    ],
    [
      "the dev build's deep link",
      `agentboard-phone-dev://pair?url=${encodeURIComponent(LAN)}`,
      "http://192.168.1.20:3773/",
      "lan-code",
    ],
    [
      "the phone's deep link",
      `agentboard-phone://pair?url=${encodeURIComponent(LAN)}`,
      "http://192.168.1.20:3773/",
      "lan-code",
    ],
  ])("reads %s", (_, input, httpBaseUrl, credential) => {
    expect(readPairingRequest(input)).toMatchObject({ httpBaseUrl, credential });
  });

  it.each([
    ["a malformed URL", "not a url", "RemotePairingUrlInvalidError"],
    ["a URL without a token", "http://192.168.1.20:3773/pair", "RemotePairingTokenMissingError"],
    [
      "an unexpected scheme",
      `evil://pair?url=${encodeURIComponent(LAN)}`,
      "RemotePairingUrlInvalidError",
    ],
    [
      "a deep link to another host",
      `agentboard-phone://open?url=${encodeURIComponent(LAN)}`,
      "PairingLinkInvalidError",
    ],
    [
      "a deep link wrapping a non-http URL",
      `agentboard-phone://pair?url=${encodeURIComponent("javascript:alert(1)#token=x")}`,
      "RemotePairingUrlInvalidError",
    ],
  ])("rejects %s", (_, input, tag) => {
    expect(() => readPairingRequest(input)).toThrow(expect.objectContaining({ _tag: tag }));
  });
});

describe("pairingErrorText", () => {
  const unreachable =
    "This phone cannot reach the PC. Check the phone and the PC are on the same Wi-Fi, then check the PC's firewall lets Agent Board in.";
  it.each([
    ["a timeout", "timeout", unreachable],
    ["a network failure", "network", unreachable],
    [
      "a spent link",
      "authentication",
      "This pairing link has expired or was already used. Make a new one on the PC in Settings, Phone.",
    ],
    [
      "a failure that names no reason",
      null,
      "Pairing did not finish. Make a new link on the PC in Settings, Phone, and try again.",
    ],
  ] as const)("Given %s, then it explains it in plain words", (_name, reason, text) => {
    expect(pairingErrorText(reason)).toBe(text);
  });
});
