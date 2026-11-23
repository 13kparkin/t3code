import { Atom, type AtomRegistry } from "effect/reactivity";
import type { ReviewDiffPreviewInput } from "@t3tools/contracts";

import { chooseTicket, ticketChoiceAtom } from "../browser/panel";
import { trimSlashes } from "../files/target";
import { type DiffSource, openFile } from "./filesView";

export interface ChangesPrefs {
  readonly layout: "unified" | "split";
  readonly ignoreWhitespace: boolean;
  /** The sidebar lists changed files as a tree of folders, not a flat list. */
  readonly asTree: boolean;
}

export const changesPrefsAtom = Atom.make<ChangesPrefs>({
  layout: "unified",
  ignoreWhitespace: false,
  asTree: false,
}).pipe(Atom.keepAlive, Atom.withLabel("changes-prefs"));

/** The request that reads one diff source of a checkout. Commits go by sha, the rest by source kind. */
export function previewInput(
  cwd: string,
  source: DiffSource,
  ignoreWhitespace: boolean,
): ReviewDiffPreviewInput {
  switch (source.kind) {
    case "working-tree":
      return { cwd, sourceKind: "working-tree", ignoreWhitespace };
    case "branch-range":
      return {
        cwd,
        sourceKind: "branch-range",
        ignoreWhitespace,
        ...(source.baseRef === null ? {} : { baseRef: source.baseRef }),
      };
    case "commit":
      return { cwd, commitSha: source.sha, ignoreWhitespace };
  }
}

/** Opens a ticket's details and its branch diff in the main view. A ticket without a worktree has no diff. */
export function openTicketChanges(
  registry: AtomRegistry.AtomRegistry,
  ticket: {
    readonly key: string;
    readonly worktreePath?: string | null;
    readonly base?: string | null;
  },
): void {
  if (ticket.worktreePath == null) return;
  const choice = registry.get(ticketChoiceAtom);
  chooseTicket(registry, {
    threadId: choice?.ticketKey === ticket.key ? choice.threadId : null,
    ticketKey: ticket.key,
  });
  openFile(registry, {
    cwd: trimSlashes(ticket.worktreePath),
    path: "",
    diff: { kind: "branch-range", baseRef: ticket.base ?? null },
  });
}
