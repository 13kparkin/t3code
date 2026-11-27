import type { AuthClientSession, ServerDirectEndpoint } from "@t3tools/contracts";
import { setPairingTokenOnUrl } from "@t3tools/shared/remote";

/** The label the board's phone app gives its session when it pairs. */
export const PHONE_LABEL = "Agent Board phone";

/** T3's one-time `/pair` link on an address a phone can reach, Tailscale first. */
export function phonePairingUrl(
  endpoints: ReadonlyArray<ServerDirectEndpoint> | undefined,
  credential: string,
): string | null {
  const endpoint =
    endpoints?.find((entry) => entry.kind === "tailnet") ??
    endpoints?.find((entry) => entry.kind === "lan");
  if (endpoint === undefined) return null;
  const url = new URL(endpoint.httpBaseUrl);
  url.pathname = "/pair";
  return setPairingTokenOnUrl(url, credential).toString();
}

// The phone presents no device type, so the engine infers one from its user agent.
export const isPhone = (session: AuthClientSession) =>
  session.client.label === PHONE_LABEL ||
  session.client.deviceType === "mobile" ||
  session.client.deviceType === "tablet";
