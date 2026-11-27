import { RegistryContext, useAtomValue } from "@effect/atom-react";
import * as Result from "effect/Result";
import { Atom } from "effect/reactivity";
import { NotebookPen } from "lucide-react";
import { type ReactNode, useContext, useRef } from "react";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import { callNotesFile, dropOnComposer } from "../chat/cardAttachment";
import type { CallEvent } from "../domain/board";
import { type CallNotes, callNotesForYouId, parseCallNotes, WHO } from "../domain/callNotes";
import { locate } from "../files/target";
import { showForYouCard } from "../sidebar/ForYouRow";
import { artifactContentsAtom, artifactContentsKey, type LoadedArtifact } from "../state/artifacts";
import type { Artifact } from "../store/artifacts";

const DRAG_THRESHOLD_PX = 4;
export const CALL_NOTES_ROWS = 6;

const NOT_LISTED = Atom.make<LoadedArtifact>({
  status: "failed",
  message: "notes.json is outside the board's folders.",
}).pipe(Atom.withLabel("call-notes:none"));

const BUTTON = "shrink-0 rounded px-1.5 text-faint hover:bg-hover hover:text-fg";

const list = (heading: string, rows: ReadonlyArray<ReactNode>) =>
  rows.length === 0 ? null : (
    <div>
      <p className="font-semibold text-muted">{heading}</p>
      <ul className="list-disc pl-4">{rows}</ul>
    </div>
  );

export function CallNotesCard({
  artifact,
  call,
  transcript,
  board,
}: {
  artifact: Artifact;
  call: Pick<CallEvent, "id" | "title">;
  transcript: Artifact;
  board: { readonly projectId: string; readonly folder: string; readonly boardId: string };
}) {
  const registry = useContext(RegistryContext);
  const { files, open } = useArtifacts();
  const at = locate(files.roots, artifact.absolutePath);
  // shortcut: read once per mount, so a rewritten notes.json shows when the section reopens;
  // re-read on a timer like `smokeAtom` if that confuses users.
  const loaded = useAtomValue(
    at === null
      ? NOT_LISTED
      : artifactContentsAtom(artifactContentsKey(files.environmentId, at.root.cwd, at.path)),
  );
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const parsed: Result.Result<CallNotes, string> | null =
    loaded.status === "loading"
      ? null
      : loaded.status === "failed"
        ? Result.fail(loaded.message)
        : loaded.contents.kind === "text"
          ? parseCallNotes(loaded.contents.contents)
          : Result.fail(
              loaded.contents.kind === "missing"
                ? "notes.json is gone."
                : "notes.json is not text.",
            );
  const notes = parsed !== null && Result.isSuccess(parsed) ? parsed.success : null;
  const forYou = (id: string) => (
    <button
      type="button"
      onClick={() => showForYouCard(registry, board, callNotesForYouId(call.id, id))}
      className={BUTTON}
    >
      For you
    </button>
  );
  return (
    <div
      data-testid="call-notes"
      aria-label={`${call.title} call notes`}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button === 0)
          press.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const start = press.current;
        if (start === null || start.moved) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        start.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (press.current?.moved && notes !== null) {
          dropOnComposer(event.clientX, event.clientY, callNotesFile(call.title, notes));
        }
        press.current = null;
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
      className="flex h-full min-w-0 cursor-grab touch-none flex-col select-none gap-1.5 overflow-y-auto rounded-md border border-line bg-bg p-2 text-[11px] text-fg"
    >
      <div className="flex items-center gap-1.5">
        <NotebookPen className="size-3.5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">Call notes</span>
        <button type="button" onClick={() => open(transcript)} className={BUTTON}>
          Transcript
        </button>
        <button type="button" onClick={() => open(artifact)} className={BUTTON}>
          notes.json
        </button>
      </div>
      {parsed === null ? (
        <p className="text-faint">Loading the notes</p>
      ) : notes === null ? (
        <p role="alert" className="break-words text-red-400">
          {Result.isFailure(parsed) ? parsed.failure : null}
        </p>
      ) : (
        <>
          <p className="break-words">{notes.summary}</p>
          {list(
            "Decisions",
            notes.decisions.map((text) => <li key={text}>{text}</li>),
          )}
          {list(
            "Actions",
            notes.actions.map((action) => (
              <li key={`${action.who} ${action.text}`}>
                {WHO[action.who]}: {action.text}
              </li>
            )),
          )}
          {list(
            "Ticket notes",
            notes.ticketNotes.map((note) => (
              <li key={note.ticket}>
                {note.ticket}: {note.text}
              </li>
            )),
          )}
          {list(
            "New work",
            notes.newWork.map((work, index) => (
              <li key={work.title}>
                {work.title}: {work.why} {forYou(`n-${index + 1}`)}
              </li>
            )),
          )}
        </>
      )}
    </div>
  );
}
