import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import * as Result from "effect/Result";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { parseTickets, type Ticket } from "../domain/ticket";
import { applyOverlay, lockedFields, parseOverlay } from "../domain/ticketOverlay";
import { ticketIssueRef } from "../issues/issueLinks";
import { readIssueDetail } from "./issues";
import { environmentProjects } from "./projects";
import { boardStoreAtom } from "./orchestrator";
import { savePulled } from "./ticketEdit";

const PULL_INTERVAL_MS = 120_000;
const PULL_GAP_MS = 5_000;

type PullProject = Pick<
  EnvironmentProject,
  "id" | "environmentId" | "workspaceRoot" | "repositoryIdentity"
>;

export interface PullStatus {
  readonly syncedAt: string | null;
  readonly error: string | null;
}

export const pullStatusAtom = Atom.make<ReadonlyMap<string, PullStatus>>(new Map()).pipe(
  Atom.keepAlive,
  Atom.withLabel("ticket-pull-status"),
);

export const pullStatusKey = (projectId: string, folder: string, ticketKey: string) =>
  `${projectId}/${folder}/${ticketKey}`;

const setStatus = (
  registry: AtomRegistry.AtomRegistry,
  key: string,
  change: (last: PullStatus) => PullStatus,
) => {
  const statuses = registry.get(pullStatusAtom);
  registry.set(
    pullStatusAtom,
    new Map(statuses).set(key, change(statuses.get(key) ?? { syncedAt: null, error: null })),
  );
};

export async function pullTicket(
  registry: AtomRegistry.AtomRegistry,
  project: PullProject,
  folder: string,
  ticket: Ticket,
): Promise<void> {
  const { issue } = ticket;
  const key = pullStatusKey(project.id, folder, ticket.key);
  if (issue == null) return;
  const ref = ticketIssueRef(ticket, {
    projectId: project.id,
    githubScope: sourceControlClients.issueScope(project.repositoryIdentity),
  });
  if (ref === null) {
    setStatus(registry, key, (last) => ({
      ...last,
      error: `${issue.key} cannot be read from this project. Unlink it or fix the key.`,
    }));
    return;
  }
  try {
    const detail = await readIssueDetail(registry, project.environmentId, ref);
    const failure = await savePulled(registry, project, folder, ticket.key, {
      issue,
      title: detail.title,
      description: detail.body,
      url: detail.url,
      at: new Date().toISOString(),
    });
    setStatus(registry, key, (last) =>
      failure === null
        ? { syncedAt: new Date().toISOString(), error: null }
        : { ...last, error: failure },
    );
  } catch (failure) {
    const error = failure instanceof Error ? failure.message : String(failure);
    setStatus(registry, key, (last) => ({ ...last, error }));
  }
}

const IDLE_STAGES: ReadonlySet<string> = new Set(["merged", "off_path"]);

function linkedTickets(tickets: string | null, details: string | null): ReadonlyArray<Ticket> {
  const parsed = tickets === null ? null : parseTickets(tickets);
  const overlay = details === null ? null : parseOverlay(details);
  if (parsed === null || !Result.isSuccess(parsed)) return [];
  const effective = applyOverlay(
    parsed.success,
    overlay !== null && Result.isSuccess(overlay) ? overlay.success : {},
  );
  return effective.filter(
    (ticket) => lockedFields(ticket).size > 0 && !IDLE_STAGES.has(ticket.stage),
  );
}

/** Keyed by `<projectId>/<folder>`. A board screen mounts it, and it stops with the screen. */
export const issuePullAtom = Atom.family((boardKey: string) =>
  Atom.make((get) => {
    const split = boardKey.indexOf("/");
    const projectId = boardKey.slice(0, split);
    const folder = boardKey.slice(split + 1);
    const project = get
      .once(environmentProjects.projectsAtom)
      .find((entry) => entry.id === projectId);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const round = () => {
      timers.forEach(clearTimeout);
      timers.clear();
      if (project === undefined || document.visibilityState !== "visible") return;
      const files = get.registry.get(boardStoreAtom(boardKey));
      if (files === null) return;
      linkedTickets(files.tickets, files.details).forEach((ticket, at) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          void pullTicket(get.registry, project, folder, ticket);
        }, at * PULL_GAP_MS);
        timers.add(timer);
      });
    };
    let started = false;
    // The first round waits for the board's files, which load after the board opens.
    const unsubscribe = get.registry.subscribe(
      boardStoreAtom(boardKey),
      (files) => {
        if (started || files === null) return;
        started = true;
        round();
      },
      { immediate: true },
    );
    const interval = setInterval(round, PULL_INTERVAL_MS);
    document.addEventListener("visibilitychange", round);
    get.addFinalizer(() => {
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", round);
      timers.forEach(clearTimeout);
    });
    return null;
  }).pipe(Atom.withLabel(`ticket-pull:${boardKey}`)),
);
