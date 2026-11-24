import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const MAX_BYTES = 512 * 1024;
const MAX_LINE = 2000;

/** Appends lines to `file`, moving the old file to `.1` once it reaches `maxBytes`. */
export function createConnectionLog(file: string, maxBytes = MAX_BYTES) {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  return {
    append: (line: string): void => {
      try {
        if (NodeFS.statSync(file).size >= maxBytes) NodeFS.renameSync(file, `${file}.1`);
      } catch {
        // No file yet.
      }
      NodeFS.appendFileSync(file, `${line.slice(0, MAX_LINE)}\n`);
    },
  };
}
