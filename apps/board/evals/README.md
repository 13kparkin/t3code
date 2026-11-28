# Board evals

An eval checks the text a board's orchestrator and agents see: the rules in `src/orchestrator/brief.md`, the vendored pstack skills in `pstack/`, the role files in `roles/`, and the review template. These evals follow the shape of the engine's [`evals/`](../../../evals/README.md). They live here because board code stays in `apps/board`.

| Eval                          | Measures                                                                                                           | Model |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| [board-prompt](board-prompt/) | Whether the orchestrator's prompt names role files, skills, and evidence files that exist and match the gate code. | None  |
| [board-claims](board-claims/) | Whether a board folder's merge cards, merged tickets, and stage moves are backed by its own records.               | None  |

## Run an eval

From `apps/board`, run `vp test run evals`. A no-model eval needs no keys, costs nothing, and runs in CI with `vp test run`. That is the agent-board job's unit-test step, and the `board-suite` gate in `scripts/ci-local.mjs`.

## The shape of an eval

- `evals/<eval>/README.md` says what the eval measures, how to run it, how to add a case, and what a run costs.
- Cases are data in `cases.ts`. Each case has an `id`, a `source` that names where it came from (a decisions line, an audit, a ticket), and its expected result.
- The eval imports the code under test from source. Never copy the brief, a role file, or a gate's file name into an eval, so it always tests the current text.
- `run.test.ts` runs the cases and asserts each against its literal expected result.

## Rules for cases

- A case reproduces a real bad experience, or guards a real good one. Name its source.
- A failure case must fail when the thing it guards breaks. Prove it once by breaking the real file and keeping the output in the ticket's evidence.
- Add controls. A control is a case whose correct answer is no problem.
- Use a generic fixture board: `acme/app` at `/home/user/acme`. Never copy a real board's tickets, names, or paths into a case.
- A case passes when its result equals the expected value exactly.
