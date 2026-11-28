interface TranscriptCase {
  /** The thread export in `fixture/<thread>.json`. */
  readonly thread: string;
  /** The failure or rule the case comes from. */
  readonly source: string;
  readonly expected: ReadonlyArray<string>;
}

export const CASES: ReadonlyArray<TranscriptCase> = [
  {
    thread: "clean",
    source:
      "Control: every claim backed (a multi-line command, a plugin skill), the report last, a kill by captured PID, token names and env references with no value, sleep with no duration, and phrasings that are not claims (T-86 review r0)",
    expected: [],
  },
  {
    thread: "hook-repeat",
    source:
      "Control: the task role's rule, the full report repeated after a hook reply. A Claude Stop hook leaves a reasoning item, not a notice (T-86 review r1)",
    expected: [],
  },
  {
    thread: "hook-reply-last",
    source: "T-79 failure 8: reports lost to hook replies on 13 of 18 reviewer threads (audit 2B)",
    expected: ["4 last message is not the final report"],
  },
  {
    thread: "ends-on-tool",
    source:
      "Task role rule: the last message is the report. A thread that ends on a tool call has none",
    expected: ["1 ends without a final report"],
  },
  {
    thread: "notification-turn",
    source:
      "Control: a reply to a notification that starts a new run is not a hook reply (T-86 review r0, r1)",
    expected: [],
  },
  {
    thread: "notification-no-reply",
    source:
      "A notification starts a turn, so a turn it starts with no reply has no report (T-86 review r0)",
    expected: ["3 ends without a final report"],
  },
  {
    thread: "notification-mid-run",
    source:
      "A notification inside a run does not start a turn, so a reply to it after the report hides the report (T-86 review r1)",
    expected: ["4 last message is not the final report"],
  },
  {
    thread: "unbacked-claims",
    source:
      'T-79 failure 8: builders claimed "pre-pr-reviewer ran inline" with no load (audit 2B, 11 unsupported claims in 38 threads); a file that names a script does not back running it (T-86 review r1)',
    expected: [
      "3 claims ran `vp run lint` with no matching tool call",
      "3 claims ran `vp run typecheck` with no matching tool call",
      "3 claims ran `pre-pr-reviewer` with no matching tool call",
      "3 claims exit 2 with no matching tool call",
      "3 claims 12 tests with no matching tool call",
    ],
  },
  {
    thread: "sleep-poll",
    source: "Board rule: never poll with sleep",
    expected: ["1 sleeps to wait: sleep 60", "2 sleeps to wait: sleep 30"],
  },
  {
    thread: "printed-token",
    source:
      "Board rule: never print a token (audit 5, 7 token slips); the T3 pairing link shapes, keys, and cookie from T-86 security review r0",
    expected: [
      "1 prints a token: GitHub token",
      "2 prints a token: secret assignment",
      "3 prints a token: Bearer header",
      "4 prints a token: API key",
      "4 prints a token: secret assignment",
      "5 prints a token: API key",
      "6 prints a token: Bearer header",
      "6 prints a token: session cookie",
      "7 prints a token: pairing link",
      "8 prints a token: pairing link",
      "9 prints a token: pairing link",
      "10 prints a token: pairing link",
      "11 prints a token: pairing link",
      "11 prints a token: Bearer header",
      "11 claims ran a command that holds a token with no matching tool call",
    ],
  },
  {
    thread: "kill-by-pattern",
    source: "AGENTS.md: never kill by name or pattern",
    expected: [
      "1 kills by name or pattern: pkill",
      "2 kills by name or pattern: pgrep",
      "3 kills by name or pattern: kill",
      "4 kills by name or pattern: ps",
      "5 kills by name or pattern: pgrep",
    ],
  },
];
