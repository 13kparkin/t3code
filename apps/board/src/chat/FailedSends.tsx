import type { PendingSend } from "./timeline";

/** Sends that did not go out, with the two ways to take them back. */
export function FailedSends({
  failed,
  onRetry,
  onEdit,
}: {
  failed: ReadonlyArray<PendingSend>;
  onRetry: (pending: PendingSend) => void;
  onEdit: (pending: PendingSend) => void;
}) {
  return failed.map((pending) => (
    <p
      key={pending.messageId}
      role="alert"
      className="mb-1.5 flex items-center gap-2 break-words text-red-400"
    >
      <span className="min-w-0 flex-1">
        Not sent: {pending.state.kind === "failed" ? pending.state.error : ""}
      </span>
      {!pending.fresh && (
        <button type="button" onClick={() => onRetry(pending)} className="hover:text-fg">
          Retry
        </button>
      )}
      <button type="button" onClick={() => onEdit(pending)} className="hover:text-fg">
        Edit
      </button>
    </p>
  ));
}
