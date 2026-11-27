import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { secondAtom } from "../state/recorder";
import { buttonClass } from "./controls/buttonClass";
import { QrCodeSvg } from "./QrCodeSvg";

/** The live link. It goes once the engine's expiry passes, which the engine never announces. */
export function PairingLink({
  url,
  expiresAt,
  onFailure,
}: {
  url: string;
  expiresAt: number;
  onFailure: (failure: string) => void;
}) {
  const now = useAtomValue(secondAtom);
  const [copied, setCopied] = useState(false);
  if (now >= expiresAt) return <p className="text-xs text-faint">The link expired.</p>;
  return (
    <div className="flex items-end gap-3">
      <QrCodeSvg value={url} title="Pairing link for the phone" />
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs text-faint">Expires at {new Date(expiresAt).toLocaleTimeString()}.</p>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => onFailure("Could not copy the link."),
            )
          }
          className={buttonClass}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
