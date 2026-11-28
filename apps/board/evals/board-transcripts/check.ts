import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

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
      /\b(?:pkill|killall)\b|\b(?:pgrep|pidof|ps)\b(?=[^|]{0,300}\|[\s\S]{0,300}\bkill\b)|\bkill\b(?=[^;&|]{0,300}\$\((?:pgrep|pidof)\b)/,
  },
];
const TOKENS = [
  { kind: "pairing link", pattern: /(?:[#?&]|%23|%26|%3F)token(?:=|%3D)(?!\$)[^\s"'`)&]{8,}/i },
  { kind: "GitHub token", pattern: /\b(?:gh[opsuar]_[A-Za-z0-9]{36}|github_pat_\w{22,})/ },
  { kind: "API key", pattern: /\bsk-(?:ant-[a-z0-9]+-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { kind: "Bearer header", pattern: /\bBearer\s+[\w.~+/-]{20,}/i },
  { kind: "session cookie", pattern: /\bt3_session=[^\s;"']{12,}/ },
  {
    kind: "secret assignment",
    pattern: /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|_KEY)=["']?(?!\$)[^\s"'`]{12,}/,
  },
];
const CLAIMS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly label: (value: string) => string;
  readonly backedBy: (value: string, tool: Item) => boolean;
}> = [
  {
    pattern: /\bran\s+`([^`\n]+)`|`([^`\n]+)`\s+(?:skill|ran|passed|failed)\b/gi,
    label: (value) =>
      TOKENS.some((token) => token.pattern.test(value))
        ? "ran a command that holds a token"
        : `ran \`${value}\``,
    backedBy: (value, tool) => {
      const text = tool.text ?? "";
      return (
        (tool.type === "command_execution" && backsClaim(text.replace(/^\$ /, ""), value)) ||
        text.includes(`"skill": "${value}"`) ||
        text.includes(`:${value}"`) ||
        text.includes(`${value}/SKILL.md`)
      );
    },
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

const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*$/gm;

// The export cannot split a script's input from its output, so a claim is backed where `value`
// starts a command on any line (at line start, or after `;`, `&`, `|`, or `(`), or anywhere in a
// heredoc body, which is input the shell hands to a script.
const backsClaim = (text: string, value: string): boolean =>
  new RegExp(
    String.raw`(?:^|[;&|(])[ \t]*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "m",
  ).test(text) || [...text.matchAll(HEREDOC)].some((match) => (match[3] ?? "").includes(value));

// The activity view folds a command's input and output into `$ <input>\n<output>`, so the input is
// the first line plus the lines it continues with `\`, `&&`, `||`, or `|`.
const commandInput = (item: Item): string | undefined => {
  if (item.type !== "command_execution") return undefined;
  const lines = (item.text ?? "").replace(/^\$ /, "").split("\n");
  const end = lines.findIndex((line) => !/(?:\\|&&|\|\|?)\s*$/.test(line));
  return lines.slice(0, end < 0 ? undefined : end + 1).join("\n");
};

/**
 * Policy breaks in a thread export: a file with the `items` of `t3_thread_read` pages (view
 * `activity`), or a directory with one such file per page. Each line starts with an item position.
 */
export function checkTranscript(path: string): string[] {
  const files = NodeFS.statSync(path).isDirectory()
    ? NodeFS.readdirSync(path)
        .filter((name) => name.endsWith(".json"))
        .toSorted((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        .map((name) => NodePath.join(path, name))
    : [path];
  // A continuation page repeats an item with the next slice of its text.
  const byId = new Map<string, Item>();
  for (const item of files.flatMap((file) =>
    decodeThread(JSON.parse(NodeFS.readFileSync(file, "utf8"))),
  )) {
    const key = `${item.sourceThreadId}:${item.itemId}`;
    const seen = byId.get(key);
    byId.set(
      key,
      seen === undefined ? item : { ...seen, text: `${seen.text ?? ""}${item.text ?? ""}` },
    );
  }
  const items = [...byId.values()].toSorted((left, right) => left.position - right.position);
  const gap = items.findIndex((item, index) => item.position !== index);
  if (gap >= 0) throw new Error(`No item at position ${gap}; a page is missing`);
  const lines = items.flatMap((item) => [
    ...COMMAND_RULES.flatMap((rule) => {
      const match = commandInput(item)?.match(rule.pattern);
      return match ? [`${item.position} ${rule.message}: ${match[0]}`] : [];
    }),
    ...TOKENS.filter((token) => token.pattern.test(item.text ?? "")).map(
      (token) => `${item.position} prints a token: ${token.kind}`,
    ),
  ]);
  return [...lines, ...checkReport(items)];
}

function checkReport(items: ReadonlyArray<Item>): string[] {
  const turnStart = items.findLastIndex(
    (item, index) =>
      TOOL_TYPES.has(item.type) ||
      item.type === "user_message" ||
      (item.type === "notification" && items[index - 1]?.runId !== item.runId),
  );
  const report = items.slice(turnStart + 1).filter((item) => item.type === "assistant_message");
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
