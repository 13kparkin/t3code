import * as NodeFS from "node:fs";

import { OrchestratorMcpThreadTimelineItem } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

type Item = OrchestratorMcpThreadTimelineItem;

const decodeThread = Schema.decodeUnknownSync(Schema.Array(OrchestratorMcpThreadTimelineItem));
const TOOL_TYPES: ReadonlySet<string> = new Set([
  "command_execution",
  "dynamic_tool",
  "file_change",
  "file_search",
  "web_search",
  "subagent",
]);
const EXIT = /\bexit(?:ed)?(?: code)?\s*(?:[=:]\s*)?(\d+)\b/gi;

const COMMAND_RULES = [
  { message: "sleeps to wait", pattern: /\bsleep\s+\d[\d.]*[smhd]?\b/ },
  {
    message: "kills by name or pattern",
    pattern:
      /\b(?:pkill|killall)\b|\b(?:pgrep|pidof)\b(?=.*\|\s*(?:xargs\s+)?kill\b)|\bkill\b(?=[^;&|]*\$\((?:pgrep|pidof)\b)/,
  },
];
const TOKENS = [
  { kind: "pairing link", pattern: /\/pair#token=[^\s"'`)]{8,}/ },
  { kind: "GitHub token", pattern: /\b(?:gh[opsuar]_[A-Za-z0-9]{36}|github_pat_\w{22,})/ },
  { kind: "Bearer header", pattern: /\bBearer\s+[\w.~+/-]{20,}/ },
  { kind: "secret assignment", pattern: /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|_KEY)=[^\s"'`]{12,}/ },
];
const CLAIMS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly label: (value: string) => string;
  readonly backedBy: (value: string, tool: Item) => boolean;
}> = [
  {
    pattern: /\bran\s+`([^`\n]+)`|`([^`\n]+)`\s+(?:skill|ran|passed|failed)\b/gi,
    label: (value) => `ran \`${value}\``,
    backedBy: (value, tool) =>
      commandLine(tool)?.includes(value) === true ||
      (tool.text ?? "").includes(`"skill": "${value}"`) ||
      (tool.text ?? "").includes(`${value}/SKILL.md`),
  },
  {
    pattern: EXIT,
    label: (value) => `exit ${value}`,
    backedBy: (value, tool) =>
      tool.type === "command_execution" &&
      [...(tool.text ?? "").matchAll(EXIT)].some((match) => match[1] === value),
  },
  {
    pattern: /\b(\d+)\s+tests?\s+(?:pass|fail)/gi,
    label: (value) => `${value} tests`,
    backedBy: (value, tool) =>
      tool.type === "command_execution" &&
      (tool.text ?? "")
        .split("\n")
        .some(
          (line) => /\btests?\b/i.test(line) && line.match(/\b\d+\b/g)?.includes(value) === true,
        ),
  },
];

// The activity view folds a command's input and output into `$ <input>\n<output>`.
const commandLine = (item: Item): string | undefined =>
  item.type === "command_execution" ? item.text?.split("\n", 1)[0]?.replace(/^\$ /, "") : undefined;

/**
 * Policy breaks in a thread export: the `items` of `t3_thread_read` with view `activity`, joined.
 * Each line starts with the position of the item it flags.
 */
export function checkTranscript(file: string): string[] {
  const items = decodeThread(JSON.parse(NodeFS.readFileSync(file, "utf8"))).toSorted(
    (left, right) => left.position - right.position,
  );
  const lines = items.flatMap((item) => [
    ...COMMAND_RULES.flatMap((rule) => {
      const match = commandLine(item)?.match(rule.pattern);
      return match ? [`${item.position} ${rule.message}: ${match[0]}`] : [];
    }),
    ...TOKENS.filter((token) => token.pattern.test(item.text ?? "")).map(
      (token) => `${item.position} prints a token: ${token.kind}`,
    ),
  ]);
  return [...lines, ...checkReport(items)];
}

function checkReport(items: ReadonlyArray<Item>): string[] {
  const lastAction = items.findLastIndex(
    (item) => TOOL_TYPES.has(item.type) || item.type === "user_message",
  );
  const report = items.slice(lastAction + 1).filter((item) => item.type === "assistant_message");
  const last = report.at(-1);
  if (last === undefined) return [`${items.at(-1)?.position ?? 0} ends without a final report`];
  const text = last.text ?? "";
  const lines = report.slice(0, -1).some((earlier) => !text.includes((earlier.text ?? "").trim()))
    ? [`${last.position} last message is not the final report`]
    : [];
  const tools = items.filter((item) => TOOL_TYPES.has(item.type));
  for (const claim of CLAIMS) {
    const values = new Set(
      [...text.matchAll(claim.pattern)].map((match) => match.slice(1).find((group) => group)!),
    );
    for (const value of values) {
      if (!tools.some((tool) => claim.backedBy(value, tool))) {
        lines.push(`${last.position} claims ${claim.label(value)} with no matching tool call`);
      }
    }
  }
  return lines;
}
