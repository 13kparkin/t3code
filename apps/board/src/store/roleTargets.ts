import type { Board, RoleOverride } from "../domain/board";
import { describeRoleTarget, mergeForYou } from "../domain/forYou";
import { type RoleInstance, roleTargetProblem } from "../orchestrator/roles";
import { changeRoleTarget, type ProjectFiles, readBoard, resolveRoleRequest } from "./boardFiles";

/** Checks, then saves one role's target in `board.json`; null removes it. Resolves to the problem, or null once saved. */
export async function setRoleTarget(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  role: string,
  target: RoleOverride | null,
  instance: RoleInstance | null,
): Promise<string | null> {
  const problem = roleTargetProblem(role, target, instance);
  if (problem !== null) return problem;
  try {
    await changeRoleTarget(files, cwd, folder, role, target);
    return null;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  }
}

/** The `role_target` items in `foryou.jsonl` text with no result in `roleRequests` yet. */
const openRoleTargets = (
  text: string | null,
  roleRequests: Readonly<Record<string, string>> | undefined,
) =>
  mergeForYou(text, [], roleRequests).cards.flatMap((card) =>
    card.origin === "file" && card.item.kind === "role_target" && card.item.status === "open"
      ? [card.item]
      : [],
  );

/**
 * Applies each open `role_target` item and records its result in `board.json`, which the app owns,
 * so a rerun changes nothing. Before the instance reports its models, items stay open for a later
 * run. `forYou` is the poll's `foryou.jsonl` text; a `held` board that already resolves every item
 * skips the `board.json` read. Resolves to whether any item was resolved.
 */
export async function applyRoleTargetRequests(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  instance: RoleInstance | null,
  forYou: string | null,
  held: Board | null,
): Promise<boolean> {
  if (instance === null || instance.offered.length === 0) return false;
  if (held !== null && openRoleTargets(forYou, held.roleRequests).length === 0) return false;
  const board = await readBoard(files, cwd, folder);
  const requests = openRoleTargets(forYou, board.roleRequests);
  for (const { id, write } of requests) {
    const { role, model, effort } = write;
    const target = model === null ? null : { model, ...(effort === undefined ? {} : { effort }) };
    const problem = roleTargetProblem(role, target, instance);
    await resolveRoleRequest(
      files,
      cwd,
      folder,
      id,
      problem === null ? `Applied: ${describeRoleTarget(write)}` : `Rejected: ${problem}`,
      problem === null ? { role, target } : null,
    );
  }
  return requests.length > 0;
}
