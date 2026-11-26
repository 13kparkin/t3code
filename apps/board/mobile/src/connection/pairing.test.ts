import { describe, expect, it } from "vite-plus/test";

import { readPairingRequest } from "./pairing";

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
