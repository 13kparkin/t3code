import { useState } from "react";

import { CONSENT_LINE } from "./recorder";

export function CopyConsentLine({ className }: { className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(CONSENT_LINE).then(() => setCopied(true))}
      className={className}
    >
      {copied ? "Copied" : "Copy consent line"}
    </button>
  );
}
