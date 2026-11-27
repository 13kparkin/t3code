import { describe, expect, it } from "vite-plus/test";

import { phonePairingUrl } from "./phonePairing";

const lan = { kind: "lan", httpBaseUrl: "http://192.168.1.20:3773" } as const;
const tailnet = { kind: "tailnet", httpBaseUrl: "http://100.64.0.7:3773/" } as const;

describe("the phone pairing link", () => {
  it.each([
    [
      "a Tailscale and a network address",
      [lan, tailnet],
      "http://100.64.0.7:3773/pair#token=fake-code",
    ],
    ["only a network address", [lan], "http://192.168.1.20:3773/pair#token=fake-code"],
    ["no address a phone can reach", [], null],
    ["an engine that lists none", undefined, null],
  ] as const)("Given %s, then the link is %j", (_name, endpoints, url) => {
    expect(phonePairingUrl(endpoints, "fake-code")).toBe(url);
  });
});
