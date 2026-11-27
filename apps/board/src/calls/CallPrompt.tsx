import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useContext } from "react";
import { createPortal } from "react-dom";

import { openBoard } from "../state/boards";
import {
  acceptConsent,
  callPromptAtom,
  boardCallsAtom,
  recordNewCall,
  recorderAtom,
} from "../state/recorder";
import { ConsentNotice } from "./ConsentNotice";

export function CallPrompt() {
  const registry = useContext(RegistryContext);
  const prompt = useAtomValue(callPromptAtom);
  const state = useAtomValue(recorderAtom)?.state;
  const calls = useAtomValue(boardCallsAtom);
  if (prompt === null) return null;
  const close = () => registry.set(callPromptAtom, null);
  if (prompt.kind === "consent") {
    return (
      <ConsentNotice
        onClose={close}
        onAccept={() => {
          close();
          void acceptConsent().then(() =>
            recordNewCall(registry, prompt.project, prompt.listed, prompt.report),
          );
        }}
      />
    );
  }
  const running =
    state?.status === "idle" ? undefined : calls.find((call) => call.id === state?.callId);
  return createPortal(
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-black/50"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="A call is recording"
        className="flex w-[400px] max-w-[92vw] flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-panel"
      >
        <h2 className="text-[15px] font-semibold">A call is recording</h2>
        <p className="text-muted">
          {running === undefined ? "Another call" : running.title} is recording, and the board
          records one call at a time. Stop it to record another.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={close} className="text-muted hover:text-fg">
            Close
          </button>
          {running !== undefined && (
            <button
              type="button"
              autoFocus
              onClick={() => {
                close();
                void openBoard(registry, {
                  projectId: running.project.id,
                  folder: running.listed.folder,
                });
              }}
              className="rounded-md bg-fg px-2.5 py-1 font-medium text-bg"
            >
              Open it
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
