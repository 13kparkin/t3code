# board-prompt

Checks the orchestrator's prompt without a model. The prompt is `renderRules()` and `renderFacts()` for a fixture board. It fails when:

- a role in `ROLE_SPECS` has no `roles/<name>.md`;
- the prompt names `roles/<name>.md` that is not in `roles/`, or `skills/<name>/SKILL.md` that is not vendored as `pstack/<name>.md`;
- the prompt names an evidence file the gate does not read. The gate's names come from `src/domain/readiness.ts`: `CI_LOCAL_FILE`, `SMOKE_FILE`, and `README_CHECK`. The merge-condition line for `ci_green`, `smoke_named`, and `readmes_pass` must name a file the gate reads. Any other backticked `.txt` name meant for that evidence must also be one the gate reads.

Skills the orchestrator loads from the pstack checkout at run time, such as `review-loop`, are not vendored, so this check cannot see them.

## Run

```sh
cd apps/board
vp test run evals/board-prompt
```

Free. It runs in CI with the rest of `vp test run`. A case passes when `checkPrompt` returns exactly its `expected` lines.

## Add a case

Add a row to `cases.ts` with an `id`, a `source`, an `input` built from `BOARD` with one thing broken, and the literal problem lines you expect. The two template cases are the controls. Add one when the board gains another review template.
