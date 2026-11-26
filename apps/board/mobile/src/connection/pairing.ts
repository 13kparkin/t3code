import { parseUrl } from "@t3tools/shared/url";
import {
  readPairingAppLink,
  resolveRemotePairingTarget,
  type ResolvedRemotePairingTarget,
} from "@t3tools/shared/remote";
import * as Schema from "effect/Schema";

const DEEP_LINK_PROTOCOL = /^agentboard-phone(?:-dev)?:$/;

export class PairingLinkInvalidError extends Schema.TaggedError<PairingLinkInvalidError>()(
  "PairingLinkInvalidError",
  {},
) {
  override get message(): string {
    return "That is not an Agent Board pairing link.";
  }
}

export interface PairingRequest extends ResolvedRemotePairingTarget {
  readonly pairingUrl: string;
}

/**
 * Reads a pasted pairing URL, a scanned QR payload, or an `agentboard-phone://pair?url=` deep link.
 * Throws a tagged error for anything that is not a well-formed http(s) pairing URL with a token.
 */
export function readPairingRequest(input: string): PairingRequest {
  const pairingUrl = unwrapAppLink(input.trim());
  return { pairingUrl, ...resolveRemotePairingTarget({ pairingUrl }) };
}

/** The host a pairing link would send its code to, or null when it is not a pairing link. */
export function pairingHost(input: string): string | null {
  try {
    return parseUrl(readPairingRequest(input).httpBaseUrl)?.hostname ?? null;
  } catch {
    return null;
  }
}

function unwrapAppLink(value: string): string {
  const t3AppLink = readPairingAppLink(value);
  if (t3AppLink !== null) return t3AppLink;
  const url = parseUrl(value);
  if (url === null || !DEEP_LINK_PROTOCOL.test(url.protocol)) return value;
  const inner = url.host === "pair" ? url.searchParams.get("url")?.trim() : undefined;
  if (!inner) throw new PairingLinkInvalidError();
  return inner;
}
