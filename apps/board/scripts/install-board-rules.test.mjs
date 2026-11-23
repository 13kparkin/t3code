import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import * as NodeURL from "node:url";

import { install } from "./install-board-rules.mjs";

const SCRIPT = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "install-board-rules.mjs",
);
const PLUGINS_DIR = NodePath.join(NodePath.dirname(SCRIPT), "..", "plugins");

// A `claude` executable that keeps its marketplaces and plugins in a JSON file and logs every call.
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.env.FAKE_CLAUDE_STATE;
const state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : { marketplaces: [], plugins: [], calls: [] };
const args = process.argv.slice(2).slice(1);
state.calls.push({ args, configDir: process.env.CLAUDE_CONFIG_DIR ?? null });
const [first, second] = args;
if (first === "marketplace" && second === "list") console.log(JSON.stringify(state.marketplaces));
else if (first === "marketplace" && second === "add") state.marketplaces.push({ name: "agent-board", path: args[2] });
else if (first === "list") console.log(JSON.stringify(state.plugins));
else if (first === "install") state.plugins.push({ id: args[1], scope: "user", enabled: true });
else if (first === "uninstall") state.plugins = state.plugins.filter((plugin) => plugin.id !== args[1]);
else if (first === "enable") state.plugins.forEach((plugin) => (plugin.enabled = true));
fs.writeFileSync(file, JSON.stringify(state));
`;

function makeFakeClaude(t, seed = {}) {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "install-board-rules-test-"));
  t.after(() => NodeFS.rmSync(root, { recursive: true, force: true }));
  const bin = NodePath.join(root, "claude");
  NodeFS.writeFileSync(bin, FAKE_CLAUDE, { mode: 0o755 });
  const stateFile = NodePath.join(root, "state.json");
  NodeFS.writeFileSync(
    stateFile,
    JSON.stringify({ marketplaces: [], plugins: [], calls: [], ...seed }),
  );
  const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, FAKE_CLAUDE_STATE: stateFile };
  const state = () => JSON.parse(NodeFS.readFileSync(stateFile, "utf8"));
  return { env, state };
}

const mutatingCalls = (state) =>
  state.calls.filter(({ args }) =>
    ["marketplace add", "install", "uninstall", "enable"].includes(
      args[0] === "marketplace" ? `marketplace ${args[1]}` : args[0],
    ),
  );

NodeTest.describe("install-board-rules", () => {
  NodeTest.test(
    "Given a fresh Claude config, when the installer runs twice, then the second run skips both steps",
    (t) => {
      const { env, state } = makeFakeClaude(t);

      NodeAssert.deepEqual(install(env), [
        "marketplace agent-board: added",
        "plugin board-rules@agent-board: installed",
      ]);
      const callsAfterFirst = mutatingCalls(state()).length;
      NodeAssert.deepEqual(install(env), [
        "marketplace agent-board: skipped, already added",
        "plugin board-rules@agent-board: skipped, already installed and enabled",
      ]);

      NodeAssert.equal(mutatingCalls(state()).length, callsAfterFirst);
    },
  );

  NodeTest.test(
    "Given the plugin is installed but disabled, when the installer runs, then it enables the plugin",
    (t) => {
      const { env } = makeFakeClaude(t, {
        marketplaces: [{ name: "agent-board", path: PLUGINS_DIR }],
        plugins: [{ id: "board-rules@agent-board", scope: "user", enabled: false }],
      });

      NodeAssert.deepEqual(install(env), [
        "marketplace agent-board: skipped, already added",
        "plugin board-rules@agent-board: enabled",
      ]);
    },
  );

  NodeTest.test(
    "Given the marketplace points at another checkout, when the installer runs, then it refuses",
    (t) => {
      const { env } = makeFakeClaude(t, {
        marketplaces: [{ name: "agent-board", path: "/elsewhere/plugins" }],
      });

      NodeAssert.throws(() => install(env), /already points at \/elsewhere\/plugins/);
    },
  );

  NodeTest.test(
    "Given the plugin installed under its old name, when the installer runs, then only board-rules remains",
    (t) => {
      const { env, state } = makeFakeClaude(t, {
        marketplaces: [{ name: "agent-board", path: PLUGINS_DIR }],
        plugins: [{ id: "omp-kit@agent-board", scope: "user", enabled: true }],
      });

      NodeAssert.deepEqual(install(env), [
        "marketplace agent-board: skipped, already added",
        "plugin omp-kit@agent-board: removed, renamed to board-rules@agent-board",
        "plugin board-rules@agent-board: installed",
      ]);
      NodeAssert.deepEqual(
        state().plugins.map((plugin) => plugin.id),
        ["board-rules@agent-board"],
      );
    },
  );

  NodeTest.test(
    "Given --config-dir, when the script runs, then every claude call targets that directory",
    (t) => {
      const { env, state } = makeFakeClaude(t);

      const stdout = NodeChildProcess.execFileSync(
        "node",
        [SCRIPT, "--config-dir", "/tmp/isolated"],
        {
          env,
          encoding: "utf8",
        },
      );

      NodeAssert.match(stdout, /plugin board-rules@agent-board: installed/);
      NodeAssert.deepEqual(
        [...new Set(state().calls.map((call) => call.configDir))],
        ["/tmp/isolated"],
      );
    },
  );
});
