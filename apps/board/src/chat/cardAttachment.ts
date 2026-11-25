import { type DragEvent, useEffect, useEffectEvent, useRef } from "react";

import { STAGE_LABEL, type Ticket } from "../domain/ticket";
import type { AgentView } from "../state/boardModel";
import { freeAgentLabel } from "../state/cardStates";

const DROP_ATTRIBUTE = "data-composer-drop";
const ATTACH_EVENT = "board:attach-card";

type AgentCard = Pick<AgentView, "threadId"> &
  Partial<Pick<AgentView, "title" | "role" | "ticketKey">>;

const FACTS: ReadonlyArray<readonly [string, (ticket: Ticket) => string | undefined]> = [
  ["Stage", (ticket) => STAGE_LABEL[ticket.stage]],
  ["Issue", ({ issue }) => issue && `${issue.tracker} ${issue.key}`],
  ["Branch", ({ branch }) => branch && `\`${branch}\``],
  ["Pull request", ({ pr }) => pr?.toString()],
  ["Depends on", ({ dependsOn }) => dependsOn?.join(", ")],
];

const SECTIONS = [
  ["Summary", "summary"],
  ["Why", "why"],
  ["Cause", "cause"],
  ["Impact", "impact"],
  ["Description", "description"],
] as const satisfies ReadonlyArray<readonly [string, keyof Ticket]>;

const facts = (rows: ReadonlyArray<readonly [string, string | null | undefined]>) =>
  rows.flatMap(([label, value]) => (value ? [`- ${label}: ${value}`] : []));

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");

const markdownFile = (base: string, text: string) =>
  new File([text], `${base}.md`, { type: "text/markdown" });

/** A ticket card as the Markdown the orchestrator reads. */
export function cardMarkdown(ticket: Ticket): string {
  const sections = SECTIONS.flatMap(([heading, field]) => {
    const text = ticket[field]?.trim();
    return text ? [`## ${heading}`, "", text, ""] : [];
  });
  const lines = facts(FACTS.map(([label, read]) => [label, read(ticket)]));
  return [`# ${ticket.key} ${ticket.title}`, "", ...lines, "", ...sections].join("\n");
}

export const cardFile = (ticket: Ticket): File =>
  markdownFile([ticket.key, slug(ticket.title)].filter(Boolean).join("-"), cardMarkdown(ticket));

/** An agent row or free agent card, named by its thread so the orchestrator can read it. A free agent falls back to its label. */
export const agentFile = (agent: AgentCard): File =>
  markdownFile(
    `agent-${agent.threadId.slice(-8)}`,
    [
      `# ${agent.title ?? freeAgentLabel(agent.threadId)}`,
      "",
      ...facts([
        ["Agent thread", `\`${agent.threadId}\``],
        ["Role", agent.role],
        ["Ticket", agent.ticketKey],
      ]),
      "",
    ].join("\n"),
  );

const attach = (target: Element | null | undefined, file: File) => {
  if (target == null) return false;
  target.dispatchEvent(new CustomEvent(ATTACH_EVENT, { detail: file }));
  return true;
};

/** Attaches `file` when the point is over the orchestrator's composer. False leaves the drag to its card. */
export const dropOnComposer = (clientX: number, clientY: number, file: File): boolean =>
  attach(document.elementFromPoint(clientX, clientY)?.closest(`[${DROP_ATTRIBUTE}]`), file);

/** Attaches `file` to the composer wherever it rests. False when the board has no orchestrator chat. */
export const sendToComposer = (file: File): boolean =>
  attach(document.querySelector(`[${DROP_ATTRIBUTE}]`), file);

/** Props for the composer form, which takes files dropped from the desktop and cards dropped from the canvas. */
export function useComposerDrop(addFiles: (files: File[]) => void) {
  const ref = useRef<HTMLFormElement | null>(null);
  const add = (files: File[]) => {
    performance.mark("board:attach-drop");
    addFiles(files);
  };
  const addCard = useEffectEvent((file: File) => add([file]));
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && event.detail instanceof File) addCard(event.detail);
    };
    node.addEventListener(ATTACH_EVENT, listener);
    return () => node.removeEventListener(ATTACH_EVENT, listener);
  }, []);
  return {
    ref,
    [DROP_ATTRIBUTE]: "",
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      if (event.dataTransfer.files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      add(Array.from(event.dataTransfer.files));
    },
  };
}
