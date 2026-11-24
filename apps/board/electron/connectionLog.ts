import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const MAX_BYTES = 512 * 1024;

/** Appends the renderer's engine connection events to a file, keeping the one before it as `.1` once it passes 512 KiB. */
export function createConnectionLog(file: string, maxBytes = MAX_BYTES) {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  return {
    append: (line: string): void => {
      try {
        if (NodeFS.statSync(file).size >= maxBytes) NodeFS.renameSync(file, `${file}.1`);
      } catch {
        // No file yet.
      }
      NodeFS.appendFileSync(file, `${line}\n`);
    },
  };
}
