import { MessagesSquare, Paperclip, SendHorizontal, Square } from "lucide-react";
import type { RefObject } from "react";

const ROUND_BUTTON = "grid size-7 shrink-0 place-items-center rounded-full";

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
