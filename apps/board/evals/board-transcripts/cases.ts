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
      "Control: every claim backed, the report last, a kill by captured PID, a token name with no value, sleep with no duration, and phrasings that are not claims",
    expected: [],
  },
  {
    thread: "hook-repeat",
    source: "Control: the task role's rule, the full report repeated after a hook reply",
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
    thread: "unbacked-claims",
    source:
      'T-79 failure 8: builders claimed "pre-pr-reviewer ran inline" with no load (audit 2B, 11 unsupported claims in 38 threads)',
    expected: [
      "2 claims ran `vp run typecheck` with no matching tool call",
      "2 claims ran `pre-pr-reviewer` with no matching tool call",
      "2 claims exit 2 with no matching tool call",
      "2 claims 12 tests with no matching tool call",
    ],
  },
  {
    thread: "sleep-poll",
    source: "Board rule: never poll with sleep",
    expected: ["1 sleeps to wait: sleep 60", "2 sleeps to wait: sleep 30"],
  },
  {
    thread: "printed-token",
    source: "Board rule: never print a token (audit 5, 7 token slips)",
    expected: [
      "1 prints a token: GitHub token",
      "2 prints a token: secret assignment",
      "3 prints a token: Bearer header",
      "4 prints a token: pairing link",
    ],
  },
  {
    thread: "kill-by-pattern",
    source: "AGENTS.md: never kill by name or pattern",
    expected: [
      "1 kills by name or pattern: pkill",
      "2 kills by name or pattern: pgrep -f acme-dev | xargs kill",
      "3 kills by name or pattern: kill $(pgrep",
    ],
  },
];
