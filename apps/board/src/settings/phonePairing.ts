import type { AuthClientSession, ServerDirectEndpoint } from "@t3tools/contracts";
import { setPairingTokenOnUrl } from "@t3tools/shared/remote";

/** The label the board's phone app gives its session when it pairs. */
export const PHONE_LABEL = "Agent Board phone";

/** The engine's address a phone can reach, Tailscale first. */
export const phoneEndpoint = (endpoints: ReadonlyArray<ServerDirectEndpoint> | undefined) =>
  endpoints?.find((entry) => entry.kind === "tailnet") ??
  endpoints?.find((entry) => entry.kind === "lan");

/** T3's one-time `/pair` link, the same one its Connections page gives. */
export function phonePairingUrl(endpoint: ServerDirectEndpoint, credential: string) {
  const url = new URL(endpoint.httpBaseUrl);
  url.pathname = "/pair";
  return setPairingTokenOnUrl(url, credential).toString();
}

// The board's own pairing labels the phone's session. A phone paired from T3's page with another
// label is missed, since it sends no device type and the engine infers desktop from its user agent.
export const isPhone = (session: AuthClientSession) =>
  session.client.label === PHONE_LABEL ||
  session.client.deviceType === "mobile" ||
  session.client.deviceType === "tablet";
