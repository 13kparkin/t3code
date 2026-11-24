import * as Result from "effect/Result";

import { BOARDS_DIR } from "../domain/board";
import { OVERLAY_FILE, type Overlay, parseOverlay } from "../domain/ticketOverlay";
import type { ProjectFiles } from "./boardFiles";

const path = (folder: string) => `${BOARDS_DIR}/${folder}/${OVERLAY_FILE}`;

export async function readOverlay(
  files: ProjectFiles,
  cwd: string,
  folder: string,
): Promise<Overlay> {
  const text = await files.read(cwd, path(folder));
  if (text === null || text.trim() === "") return {};
  const parsed = parseOverlay(text);
  if (Result.isFailure(parsed)) throw new Error(parsed.failure.message);
  return parsed.success;
}

let running: Promise<unknown> = Promise.resolve();

/**
 * Applies `change` to the overlay read fresh from the board's file. Calls run one at a time, so two
 * quick edits both count. The app is the only writer of this file, and it never writes
 * `tickets.json`. A file it cannot read stops the change and is left as it is.
 */
export function changeOverlay(
  files: ProjectFiles,
  cwd: string,
  folder: string,
  change: (overlay: Overlay) => Overlay,
): Promise<void> {
  const run = running.then(async () => {
    const current = await readOverlay(files, cwd, folder);
    const next = change(current);
    if (next !== current)
      await files.write(cwd, path(folder), `${JSON.stringify(next, null, 2)}\n`);
  });
  running = run.catch(() => undefined);
  return run;
}
