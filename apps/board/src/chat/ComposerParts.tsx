import { MessagesSquare, Paperclip, SendHorizontal, Square, X } from "lucide-react";
import type { RefObject } from "react";

import { AttachmentThumb } from "./AttachmentThumb";
import { SUGGESTIONS } from "./suggestions";
import type { PendingSend } from "./timeline";

const markShown = (chip: HTMLElement | null) => {
  if (chip !== null) performance.mark("board:attach-shown");
};

const ROUND_BUTTON = "grid size-7 shrink-0 place-items-center rounded-full";

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

export function FreshNotice({ onCancel }: { onCancel: () => void }) {
  return (
    <p className="mb-1.5 flex items-center gap-2 text-muted">
      <span className="min-w-0 flex-1">The next message starts a fresh session.</span>
      <button type="button" onClick={onCancel} className="hover:text-fg">
        Cancel
      </button>
    </p>
  );
}

/** Starter prompts: a click fills the draft and does not send it. */
export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <ul aria-label="Suggestions" className="flex gap-1.5 overflow-x-auto">
      {SUGGESTIONS.map((suggestion) => (
        <li key={suggestion} className="shrink-0">
          <button
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted shadow-panel hover:text-fg"
          >
            {suggestion}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AttachedFiles({
  files,
  onRemove,
}: {
  files: ReadonlyArray<File>;
  onRemove: (index: number) => void;
}) {
  return (
    <ul aria-label="Attached files" className="flex flex-wrap gap-1">
      {files.map((file, index) => (
        <li
          key={`${file.name}:${file.lastModified}:${file.size}`}
          ref={markShown}
          className="flex max-w-full items-center gap-1 rounded-md border border-line bg-hover px-1.5 text-[11px] leading-5 text-fg"
        >
          <AttachmentThumb file={file} />
          <span className="min-w-0 truncate">{file.name}</span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(index)}
            className="text-muted hover:text-fg"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Attach, show or hide the thread, and send (or stop, while a turn runs and the draft is empty). */
export function ComposerActions({
  picker,
  threadShown,
  stopping,
  canSend,
  onAttach,
  onToggleThread,
  onStop,
}: {
  picker: RefObject<HTMLInputElement | null>;
  threadShown: boolean;
  stopping: boolean;
  canSend: boolean;
  onAttach: (added: File[]) => void;
  onToggleThread: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        data-testid="attach-input"
        onChange={(event) => {
          onAttach(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        aria-label="Attach files"
        onClick={() => picker.current?.click()}
        className={`${ROUND_BUTTON} text-muted hover:bg-hover hover:text-fg`}
      >
        <Paperclip className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={threadShown ? "Hide the chat thread" : "Show the chat thread"}
        aria-pressed={threadShown}
        onClick={onToggleThread}
        className={`${ROUND_BUTTON} hover:bg-hover hover:text-fg ${threadShown ? "text-fg" : "text-muted"}`}
      >
        <MessagesSquare className="size-3.5" />
      </button>
      {stopping ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className={`${ROUND_BUTTON} bg-fg text-bg`}
        >
          <Square className="size-3 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className={`${ROUND_BUTTON} bg-fg text-bg disabled:opacity-40`}
        >
          <SendHorizontal className="size-3.5" />
        </button>
      )}
    </>
  );
}
