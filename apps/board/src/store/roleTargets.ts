import { BOARDS_DIR, type RoleOverride } from "../domain/board";
import { describeRoleTarget, mergeForYou } from "../domain/forYou";
import { type RoleInstance, roleTargetProblem } from "../orchestrator/roles";
import { changeRoleTarget, type ProjectFiles } from "./boardFiles";

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

/** The open `role_target` items in `foryou.jsonl` text. */
export const openRoleTargets = (text: string | null) =>
  mergeForYou(text, []).cards.flatMap((card) =>
    card.origin === "file" && card.item.kind === "role_target" && card.item.status === "open"
      ? [card.item]
      : [],
  );

/**
 * Applies each open `role_target` item and appends its resolving line, so a rerun changes nothing.
 * Before the instance reports its models, items stay open for a later run. Resolves to whether any
 * item was resolved.
 */
export async function applyRoleTargetRequests(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  instance: RoleInstance | null,
): Promise<boolean> {
  if (instance === null || instance.offered.length === 0) return false;
  const path = `${BOARDS_DIR}/${folder}/foryou.jsonl`;
  const requests = openRoleTargets(await files.read(cwd, path));
  if (requests.length === 0) return false;
  const lines: string[] = [];
  for (const { id, write } of requests) {
    const { role, model, effort } = write;
    const target = model === null ? null : { model, ...(effort === undefined ? {} : { effort }) };
    const problem = await setRoleTarget(files, cwd, folder, role, target, instance);
    const resolution =
      problem === null ? `Applied: ${describeRoleTarget(write)}` : `Rejected: ${problem}`;
    lines.push(JSON.stringify({ id, status: "resolved", resolution }));
  }
  // shortcut: re-reading narrows, but does not close, the window where an orchestrator line is lost; add an append to ProjectFiles if it shows up.
  const latest = (await files.read(cwd, path)) ?? "";
  const separator = latest === "" || latest.endsWith("\n") ? "" : "\n";
  await files.write(cwd, path, `${latest}${separator}${lines.join("\n")}\n`);
  return true;
}
