import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as Result from "effect/Result";

import { mergeForYou } from "../../src/domain/forYou";
import {
  CI_LOCAL_FILE,
  evaluateReadiness,
  mergeTicketKey,
  namesKey,
  parseCiLocal,
  parseSmoke,
  SMOKE_FILE,
} from "../../src/domain/readiness";
import {
  parseTickets,
  TICKET_STAGES,
  type Ticket,
  type TicketStage,
} from "../../src/domain/ticket";
import { ROLE_SPECS } from "../../src/orchestrator/roleSpecs";

const REVIEW_ROLES: ReadonlySet<string> = new Set(
  ROLE_SPECS.filter((role) => role.t3Role === "review").map((role) => role.name),
);
const PATH_STAGES: ReadonlyArray<TicketStage> = TICKET_STAGES.filter(
  (stage) => stage !== "todo" && stage !== "off_path",
);
const MOVE = new RegExp(`\\bto \`?(${TICKET_STAGES.join("|")})\`?(?![\\w-])`, "g");

const readText = (path: string) =>
  NodeFS.existsSync(path) ? NodeFS.readFileSync(path, "utf8") : null;

/** The stages a ticket has moved to, each of which needs a decision line of its own. */
const movesOf = (stage: TicketStage): ReadonlyArray<TicketStage> =>
  stage === "off_path" ? [stage] : PATH_STAGES.slice(0, PATH_STAGES.indexOf(stage) + 1);

/** The claims in a board folder that its own records do not back, one line each. */
export function checkClaims(boardDir: string): string[] {
  const parsed = parseTickets(readText(NodePath.join(boardDir, "tickets.json")) ?? "");
  if (Result.isFailure(parsed)) return [parsed.failure.message];
  const tickets = parsed.success;
  const keys = tickets.map((ticket) => ticket.key);

  const items = mergeForYou(readText(NodePath.join(boardDir, "foryou.jsonl")), []).cards.flatMap(
    (card) => (card.origin === "file" && card.item.kind === "merge_approval" ? [card.item] : []),
  );
  // The latest card for a ticket replaces an earlier one, as on the board.
  const cards = new Map<string, (typeof items)[number]>();
  for (const item of items.toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    const key = mergeTicketKey(item, keys);
    if (key !== null) cards.set(key, item);
  }

  const moves = (readText(NodePath.join(boardDir, "decisions.tsv")) ?? "")
    .split("\n")
    .slice(1)
    .map((row) => row.split("\t")[1] ?? "")
    .map((decision) => ({
      keys: keys.filter((key) => namesKey(decision, key)),
      stages: [...decision.matchAll(MOVE)].map((match) => match[1]),
    }));

  const cardProblems = (ticket: Ticket): string[] => {
    const card = cards.get(ticket.key);
    if (card === undefined) return [];
    const folder = NodePath.join(boardDir, "artifacts", ticket.key);
    const listed = NodeFS.existsSync(folder)
      ? NodeFS.readdirSync(folder, { recursive: true, encoding: "utf8" })
      : [];
    const ciLocal = readText(NodePath.join(folder, CI_LOCAL_FILE));
    const smoke = readText(NodePath.join(folder, SMOKE_FILE));
    const gate = evaluateReadiness({
      ticket,
      tickets,
      evidence: listed.map((name) => `artifacts/${ticket.key}/${name}`),
      // A frozen folder has no host, so the pull request reports no checks and the gate reads ci-local.txt.
      live: {
        state: "open",
        checksState: null,
        mergeability: "unknown",
        headSha: ticket.headSha ?? null,
        checks: [],
        url: null,
        size: null,
      },
      ciLocal: ciLocal === null ? null : parseCiLocal(ciLocal),
      smoke: smoke === null ? null : parseSmoke(smoke),
      mergeOrderNote: card.conditions.parent_ready.note ?? null,
      reviewRoles: REVIEW_ROLES,
      now: 0,
    });
    return gate
      .filter(({ key, missing }) => card.conditions[key].met && missing !== null)
      .map(({ key, missing }) => `${ticket.key} ${key} claimed met: ${missing}`);
  };

  return tickets.flatMap((ticket) => [
    ...cardProblems(ticket),
    ...(ticket.stage === "merged" ? (ticket.steps ?? []) : [])
      .filter((step) => step.state === "pending")
      .map((step) => `${ticket.key} merged with a pending step: ${step.text}`),
    ...movesOf(ticket.stage)
      .filter(
        (stage) =>
          !moves.some(
            (move) =>
              move.keys.length === 1 &&
              move.keys[0] === ticket.key &&
              move.stages.length === 1 &&
              move.stages[0] === stage,
          ),
      )
      .map((stage) => `${ticket.key} move to ${stage} has no decision line of its own`),
  ]);
}
