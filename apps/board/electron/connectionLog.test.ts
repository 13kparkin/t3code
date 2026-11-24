import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { createConnectionLog } from "./connectionLog";

describe("the connection log", () => {
  it("Given a log past its size, when a line is appended, then the old lines move to .1 and the new line starts a fresh file", () => {
    const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-connection-log-"));
    try {
      const file = NodePath.join(folder, "logs", "board-connection.log");
      const log = createConnectionLog(file, 20);
      log.append("09:47:26 backoff");
      log.append("09:49:03 connected");
      log.append("09:50:05 connecting");
      expect([NodeFS.readFileSync(`${file}.1`, "utf8"), NodeFS.readFileSync(file, "utf8")]).toEqual(
        ["09:47:26 backoff\n09:49:03 connected\n", "09:50:05 connecting\n"],
      );
    } finally {
      NodeFS.rmSync(folder, { recursive: true, force: true });
    }
  });

  it("Given a log path that cannot be written, when a line is appended, then nothing throws", () => {
    const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-connection-log-"));
    try {
      expect(() => createConnectionLog(folder).append("09:47:26 backoff")).not.toThrow();
    } finally {
      NodeFS.rmSync(folder, { recursive: true, force: true });
    }
  });
});
