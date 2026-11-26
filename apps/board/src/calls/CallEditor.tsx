import { TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";

import { CallApp, type CallEvent } from "../domain/board";
import { Select } from "../settings/controls/Select";
import { newId } from "../state/boards";
import { CALL_APPS } from "./recorder";

const APP_OPTIONS = CallApp.literals.map((value) => ({ value, title: CALL_APPS[value].title }));

/** A date as a `datetime-local` value, which has no offset, in the viewer's time zone. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const field =
  "min-w-0 rounded-md border border-line bg-bg px-2 py-1 text-fg placeholder:text-faint disabled:opacity-60";

/** Adds a call event, or edits one. `onSave` resolves to the failure text, or null once saved. */
export function CallEditor({
  call,
  onSave,
  onClose,
}: {
  call: CallEvent | null;
  onSave: (call: CallEvent) => Promise<string | null>;
  onClose: () => void;
}) {
  const savedAt = call === null ? "" : toLocalInput(new Date(call.start));
  const [title, setTitle] = useState(call?.title ?? "");
  const [at, setAt] = useState(savedAt);
  const [app, setApp] = useState<CallApp>(call?.app ?? "zoom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = new Date(at);
  const ready = title.trim() !== "" && !Number.isNaN(start.getTime());

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const failure = await onSave({
      id: call?.id ?? newId(),
      title: title.trim(),
      // An untouched time keeps its stored instant, which a repeated DST hour would otherwise move.
      start: call !== null && at === savedAt ? call.start : start.toISOString(),
      app,
    });
    setBusy(false);
    if (failure === null) onClose();
    else setError(failure);
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-black/50"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={call === null ? "Add call" : "Edit call"}
        onSubmit={(event) => void save(event)}
        className="flex w-[400px] max-w-[92vw] flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-panel"
      >
        <h2 className="text-[15px] font-semibold">{call === null ? "Add a call" : "Edit call"}</h2>
        <label className="flex flex-col gap-1 text-muted">
          Title
          <input
            autoFocus
            value={title}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Design sync"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-muted">
          Starts
          <input
            type="datetime-local"
            value={at}
            disabled={busy}
            onChange={(event) => setAt(event.target.value)}
            className={field}
          />
        </label>
        <div className="flex flex-col gap-1 text-muted">
          App
          <Select label="App" value={app} options={APP_OPTIONS} disabled={busy} onChange={setApp} />
        </div>
        {CALL_APPS[app].browser && (
          <p data-testid="browser-warning" className="flex items-start gap-1.5 text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />A browser recording
            takes every tab in that browser.
          </p>
        )}
        {error !== null && (
          <p role="alert" className="break-words text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !ready}
            className="rounded-md bg-fg px-2.5 py-1 font-medium text-bg disabled:opacity-50"
          >
            {call === null ? "Add call" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
