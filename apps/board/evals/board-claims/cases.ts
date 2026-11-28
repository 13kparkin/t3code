interface ClaimsCase {
  /** The fixture ticket the case reads. */
  readonly ticket: string;
  /** The failure or rule the case comes from. */
  readonly source: string;
  readonly expected: ReadonlyArray<string>;
}

export const CASES: ReadonlyArray<ClaimsCase> = [
  {
    ticket: "APP-1",
    source: "Control: a merged ticket whose resolved merge card is backed by every file",
    expected: [],
  },
  {
    ticket: "APP-2",
    source: "Control: a ticket awaiting approval whose open merge card is backed by every file",
    expected: [],
  },
  {
    ticket: "APP-3",
    source: "T-79 failure 1: reviews_fixed claimed while the latest verdict was round 1's P1",
    expected: [
      "APP-3 reviews_fixed claimed met: Unresolved P0 or P1 from review-loop",
      "APP-3 delta_rereviewed claimed met: Fix round 2 has no review after it",
    ],
  },
  {
    ticket: "APP-4",
    source: "T-79 failure 2: readmes_pass claimed with no readme-check file",
    expected: ["APP-4 readmes_pass claimed met: No README check in the evidence"],
  },
  {
    ticket: "APP-5",
    source: "T-79 failure 5: ci_green claimed from a ci-local.txt that ran on another commit",
    expected: ["APP-5 ci_green claimed met: ci-local.txt ran on 0000000, not 5555555"],
  },
  {
    ticket: "APP-6",
    source: "T-79 failure 5: ci_green claimed from a ci-local.txt with a failed step",
    expected: ["APP-6 ci_green claimed met: ci-local.txt has suite-exit=1"],
  },
  {
    ticket: "APP-7",
    source: "T-79 failure 7: a ticket merged with a pending step",
    expected: ["APP-7 merged with a pending step: Verify on the matching surface"],
  },
  {
    ticket: "APP-8",
    source: "T-79 failure 7: two stage moves batched into one decision line",
    expected: [
      "APP-8 move to verifying has no decision line of its own",
      "APP-8 move to pr has no decision line of its own",
    ],
  },
];
