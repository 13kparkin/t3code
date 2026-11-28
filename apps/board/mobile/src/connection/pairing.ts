import { parseUrl } from "@t3tools/shared/url";
import {
  readPairingAppLink,
  resolveRemotePairingTarget,
  type ResolvedRemotePairingTarget,
} from "@t3tools/shared/remote";
import type {
  ConnectionBlockedReason,
  ConnectionTransientReason,
} from "@t3tools/client-runtime/connection";
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

type FailureReason = ConnectionTransientReason | ConnectionBlockedReason;

const UNREACHABLE =
  "This phone cannot reach the PC. Check the phone and the PC are on the same Wi-Fi, then check the PC's firewall lets Agent Board in.";
const RETRY =
  "Pairing did not finish. Make a new link on the PC in Settings, Phone, and try again.";

const PAIRING_FAILURE = {
  timeout: UNREACHABLE,
  network: UNREACHABLE,
  transport: UNREACHABLE,
  "endpoint-unavailable": UNREACHABLE,
  "remote-unavailable": UNREACHABLE,
  "relay-unavailable": RETRY,
  "session-pending": RETRY,
  "approval-pending": RETRY,
  authentication:
    "This pairing link has expired or was already used. Make a new one on the PC in Settings, Phone.",
  permission: "The PC refused this phone. Make a new link on the PC in Settings, Phone.",
  configuration:
    "That pairing link is not complete. Scan the QR code, or copy the whole link from Settings, Phone.",
  unsupported:
    "This phone's Agent Board and the PC's engine do not match. Update both, then pair again.",
} as const satisfies Record<FailureReason, string>;

/** What a failed pairing means for the person holding the phone, and what to do about it. */
export function pairingErrorText(reason: FailureReason | null): string {
  return reason === null ? RETRY : PAIRING_FAILURE[reason];
}
