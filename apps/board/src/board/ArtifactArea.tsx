import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { Captions, FileAudio, FileText, Folder, NotebookPen, Phone, X } from "lucide-react";
import { type MouseEvent, type ReactNode, useContext, useRef, useState } from "react";

import { useArtifacts } from "../artifacts/ArtifactsContext";
import { START } from "../calls/CallCards";
import { transcribing } from "../calls/recorder";
import { folderView } from "../domain/artifact";
import type { CallEvent } from "../domain/board";
import { callNotesPath } from "../domain/callNotes";
import { setCardState } from "../state/boardCards";
import { folderArchived } from "../state/cardStates";
import { changeFileBox, fileBoxesAtom } from "../state/boardUi";
import {
  callNotesRequestsAtom,
  openRecordingFile,
  requestCallNotes,
  recorderAtom,
  transcribeCall,
  transcriptionsAtom,
  transcriptPath,
} from "../state/recorder";
import type { Artifact } from "../store/artifacts";
import type { ValidBoard } from "../store/boardFiles";
import { ContextMenu } from "../ui/ContextMenu";
import { ArtifactCard } from "./ArtifactCard";
import { CALL_NOTES_ROWS, CallNotesCard } from "./CallNotesCard";
import { FileBox } from "./FileBox";
import { LANE_GAP, LANE_WIDTH } from "./layout";
import { Tile } from "./Tile";
import { useViewScale } from "./Viewport";

const SECTION = { width: LANE_WIDTH, height: 200 };
const HOME = { x: 0, y: 0 };
const NOTICE = {
  folder: "No app opens this file here, so its folder opened.",
  missing: "This take is no longer on this PC.",
} as const;
const TAKE_FILES = ["me.wav", "them.wav", "recording.json"] as const;

/**
 * The board's files and its finished recorded calls, and the files sections they open. A folder or
 * a call opens its own section; a board file opens the viewer. Every card's right-click only
 * archives it, under `file:<path>`, `dir:<path>`, `take:<call>/<start>/<name>`, or the call's id.
 */
export function ArtifactArea({
  project,
  listed,
  calls,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  calls: ReadonlyArray<CallEvent>;
}) {
  const registry = useContext(RegistryContext);
  const { groups } = useArtifacts();
  const boardId = listed.board.id;
  const boxes = useAtomValue(fileBoxesAtom)[boardId] ?? {};
  const snapshot = useAtomValue(recorderAtom);
  const jobs = useAtomValue(transcriptionsAtom);
  const notesRequests = useAtomValue(callNotesRequestsAtom);
  const states = listed.board.cardStates ?? {};
  const scale = useViewScale();
  const anchor = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    key: string;
    label: string;
    from: HTMLElement;
  } | null>(null);
  const [notices, setNotices] = useState<{ readonly [key: string]: string }>({});
  const files = groups.board.filter((file) => states[`file:${file.path}`] !== "archived");
  const opened = Object.entries(boxes).flatMap(([key, box]) =>
    key !== "artifacts" && box.open === true ? [key] : [],
  );
  /**
   * A section opens on top, and the first time beside the card that opened it: to its right, else
   * its left, else shifted in, so it stays inside the visible canvas.
   */
  const show = (key: string) => (event: MouseEvent<HTMLElement>) => {
    const card = event.currentTarget.getBoundingClientRect();
    const home = anchor.current?.getBoundingClientRect() ?? card;
    const view =
      anchor.current?.closest('[data-testid="board-canvas"]')?.getBoundingClientRect() ?? card;
    const [width, height, gap] = [SECTION.width * scale, SECTION.height * scale, LANE_GAP * scale];
    const right = card.right + gap;
    const left =
      right + width <= view.right
        ? right
        : card.left - gap - width >= view.left
          ? card.left - gap - width
          : Math.max(view.left, view.right - width);
    const top = Math.max(view.top, Math.min(card.top, view.bottom - height));
    const front = Math.max(0, ...Object.values(boxes).map((box) => box.z ?? 0)) + 1;
    const beside = {
      ...SECTION,
      x: Math.round((left - home.left) / scale),
      y: Math.round((top - home.top) / scale),
    };
    void changeFileBox(registry, boardId, key, beside, (box) => ({ ...box, open: true, z: front }));
  };
  const hide = (key: string) =>
    void changeFileBox(registry, boardId, key, HOME, (box) => ({ ...box, open: false }));
  const archivable = (key: string, label: string, card: ReactNode, span = 1) => (
    <li
      key={key}
      className={span === 1 ? "min-w-0" : "col-span-full min-w-0"}
      style={span === 1 ? undefined : { gridRow: `span ${span}` }}
      onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
        event.preventDefault();
        event.stopPropagation();
        // A menu opened from the keyboard has no pointer, so it opens at the card.
        const rect = event.currentTarget.getBoundingClientRect();
        const keyboard = event.clientX === 0 && event.clientY === 0;
        setMenu({
          x: keyboard ? rect.left : event.clientX,
          y: keyboard ? rect.bottom : event.clientY,
          key,
          label,
          from: event.currentTarget,
        });
      }}
    >
      {card}
    </li>
  );
  const folderCards = (folder: string) => {
    const view = folderView(files, folder);
    return [
      ...view.folders
        .filter((entry) => states[`dir:${entry.path}`] !== "archived")
        .map((entry) =>
          archivable(
            `dir:${entry.path}`,
            entry.name,
            <Tile
              icon={Folder}
              title={entry.name}
              hint={`${entry.count} ${entry.count === 1 ? "file" : "files"}`}
              onClick={show(`dir:${entry.path}`)}
            />,
          ),
        ),
      ...view.files.map((file) =>
        archivable(`file:${file.path}`, file.name, <ArtifactCard artifact={file} />),
      ),
    ];
  };
  const takesOf = (callId: string) =>
    (snapshot?.recordings ?? [])
      .filter((take) => take.callId === callId)
      .toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const transcriptOf = (callId: string) =>
    groups.board.find((file) => file.path === transcriptPath(callId));
  const notesCards = (call: CallEvent, transcript: Artifact) => {
    const notes = groups.board.find((file) => file.path === callNotesPath(call.id));
    if (notes !== undefined) {
      if (states[`file:${notes.path}`] === "archived") return [];
      return [
        archivable(
          `file:${notes.path}`,
          "Call notes",
          <CallNotesCard
            artifact={notes}
            call={call}
            transcript={transcript}
            board={{ projectId: project.id, folder: listed.folder, boardId }}
          />,
          CALL_NOTES_ROWS,
        ),
      ];
    }
    const request = notesRequests[call.id];
    return [
      <li key="notes" className="min-w-0">
        <Tile
          icon={NotebookPen}
          title="Write call notes"
          hint={
            request?.status === "sending"
              ? "Sending to the orchestrator"
              : request?.status === "sent"
                ? "Sent to the orchestrator"
                : request?.status === "failed"
                  ? "Failed. Press to try again."
                  : "Asks the orchestrator for notes and For you items"
          }
          onClick={() => void requestCallNotes(registry, project, listed.folder, call)}
        />
      </li>,
      ...(request?.status === "failed"
        ? [
            <li
              key="notes-error"
              role="alert"
              className="col-span-full text-[11px] break-words text-red-400"
            >
              {request.message}
            </li>,
          ]
        : []),
    ];
  };
  // Between deleting the audio and the next file listing, the call has neither takes nor transcript.
  const transcribed = (callId: string) =>
    transcriptOf(callId) !== undefined ||
    jobs[callId]?.status === "running" ||
    jobs[callId]?.status === "written";
  const callCards = calls.map((call) => {
    const takes = takesOf(call.id).length;
    const where =
      takes > 0
        ? ` · ${takes} ${takes === 1 ? "take" : "takes"}`
        : transcribed(call.id)
          ? " · transcribed"
          : snapshot !== null && call.recordedAt !== undefined
            ? " · recorded on another PC"
            : "";
    return archivable(
      call.id,
      call.title,
      <Tile
        icon={Phone}
        title={call.title}
        hint={`${START.format(new Date(call.start))}${where}`}
        onClick={show(`call:${call.id}`)}
      />,
    );
  });
  const callFiles = (call: CallEvent) => {
    const takes = takesOf(call.id);
    const transcript = transcriptOf(call.id);
    const job = jobs[call.id];
    const shown =
      transcript === undefined
        ? []
        : [
            ...notesCards(call, transcript),
            ...(states[`file:${transcript.path}`] === "archived"
              ? []
              : [
                  archivable(
                    `file:${transcript.path}`,
                    transcript.name,
                    <ArtifactCard artifact={transcript} />,
                  ),
                ]),
          ];
    if (takes.length === 0) {
      if (transcribed(call.id)) return shown;
      return [
        <li key="none" className="col-span-full text-[11px] text-faint">
          {snapshot !== null && call.recordedAt !== undefined
            ? "Its audio is on another PC."
            : "No audio on this PC."}
        </li>,
      ];
    }
    return [
      ...shown,
      <li key="transcribe" className="min-w-0">
        <Tile
          icon={Captions}
          title={transcript === undefined ? "Transcribe" : "Transcribe again"}
          hint={
            job?.status === "running"
              ? transcribing(job)
              : job?.status === "failed"
                ? "Failed. Transcribe to try again."
                : "Writes Me and Them lines on the engine"
          }
          onClick={() => void transcribeCall(registry, project, listed.folder, call.id)}
        />
      </li>,
      ...(job?.status === "failed"
        ? [
            <li
              key="transcribe-error"
              role="alert"
              className="col-span-full text-[11px] break-words text-red-400"
            >
              {job.message}
            </li>,
          ]
        : []),
      ...takeCards(call, takes),
    ];
  };
  const takeCards = (call: CallEvent, takes: ReturnType<typeof takesOf>) =>
    takes.flatMap((take, index) =>
      TAKE_FILES.flatMap((file) => {
        const key = `take:${call.id}/${take.startedAt}/${file}`;
        if (states[key] === "archived") return [];
        return [
          archivable(
            key,
            file,
            <Tile
              icon={file === "recording.json" ? FileText : FileAudio}
              title={file}
              hint={notices[key] ?? `Take ${index + 1} · ${START.format(new Date(take.startedAt))}`}
              onClick={() =>
                void openRecordingFile({ callId: call.id, startedAt: take.startedAt, file }).then(
                  (result) =>
                    setNotices((shown) => {
                      const { [key]: _old, ...rest } = shown;
                      return result === "opened" ? rest : { ...rest, [key]: NOTICE[result] };
                    }),
                )
              }
            />,
          ),
        ];
      }),
    );
  const closeButton = (key: string) => (
    <button
      type="button"
      aria-label="Close"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => hide(key)}
      className="grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  );
  const heading = (name: string, note: string) => (
    <>
      <span className="truncate px-2 text-[11px] leading-5 font-semibold text-muted">{name}</span>
      <span className="shrink-0 text-[11px] text-faint">{note}</span>
    </>
  );
  const top = [...folderCards(""), ...callCards];
  const sections = opened.flatMap((key) => {
    if (key.startsWith("dir:")) {
      const path = key.slice("dir:".length);
      if (folderArchived(states, path)) return [];
      const cards = folderCards(path);
      return [{ key, title: heading(path.slice(path.lastIndexOf("/") + 1), path), cards }];
    }
    const call = calls.find((entry) => key === `call:${entry.id}`);
    if (call === undefined) return [];
    const title = heading(call.title, START.format(new Date(call.start)));
    return [{ key, title, cards: callFiles(call) }];
  });
  return (
    <div ref={anchor} className="relative flex self-stretch">
      <FileBox
        boardId={boardId}
        boxKey="artifacts"
        place="row"
        fallback={HOME}
        title={heading("Artifacts", String(top.length))}
      >
        {top.length === 0 ? <li className="text-[11px] text-faint">No artifacts yet.</li> : top}
      </FileBox>
      {sections.map((section) => (
        <FileBox
          key={section.key}
          boardId={boardId}
          boxKey={section.key}
          place="free"
          fallback={{ ...SECTION, ...HOME }}
          title={section.title}
          actions={closeButton(section.key)}
        >
          {section.cards.length === 0 ? (
            <li className="text-[11px] text-faint">Nothing here.</li>
          ) : (
            section.cards
          )}
        </FileBox>
      ))}
      {menu !== null && (
        <ContextMenu
          at={menu}
          label={`${menu.label} actions`}
          items={[
            {
              label: "Archive",
              onSelect: () => {
                // The archived card leaves, so focus moves to the next card in its box, or the box's header.
                const next =
                  menu.from.nextElementSibling?.querySelector("button") ??
                  menu.from.closest("section")?.querySelector("header");
                next?.focus();
                void setCardState(registry, project, listed, menu.key, "archived");
              },
            },
          ]}
          onClose={() => {
            // Escape or a pick leaves focus in the closing menu, so it goes back to the card's button.
            const inMenu = document.activeElement?.closest('[role="menu"]') != null;
            setMenu(null);
            if (inMenu) menu.from.querySelector("button")?.focus();
          }}
        />
      )}
    </div>
  );
}
