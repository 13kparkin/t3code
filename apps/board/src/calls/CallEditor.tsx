import { TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";

import { CallApp, type CallEvent } from "../domain/board";
import { Select } from "../settings/controls/Select";
import { CALL_APPS } from "./recorder";

const APP_OPTIONS = CallApp.literals.map((value) => ({ value, title: CALL_APPS[value].title }));

const field =
  "min-w-0 rounded-md border border-line bg-bg px-2 py-1 text-fg placeholder:text-faint disabled:opacity-60";

/** Renames a call or changes its app. `onSave` resolves to the failure text, or null once saved. */
export function CallEditor({
  call,
  onSave,
  onClose,
}: {
  call: CallEvent;
  onSave: (call: CallEvent) => Promise<string | null>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(call.title);
  const [app, setApp] = useState<CallApp>(call.app);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = title.trim() !== "";

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const failure = await onSave({ id: call.id, title: title.trim(), start: call.start, app });
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
        aria-label="Edit call"
        onSubmit={(event) => void save(event)}
        className="flex w-[400px] max-w-[92vw] flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-panel"
      >
        <h2 className="text-[15px] font-semibold">Edit call</h2>
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
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
