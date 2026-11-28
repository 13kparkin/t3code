# board-claims

Checks a board folder's records without a model. It reads `tickets.json`, `foryou.jsonl`, `decisions.tsv`, and `artifacts/<key>/`, and lists each claim the records do not back:

- a merge card says a condition is met, but the gate finds it missing. The gate is `evaluateReadiness` in `src/domain/readiness.ts`, run on the ticket's evidence files. A frozen folder has no host, so the pull request counts as reporting no checks and `ci_green` reads `ci-local.txt`. Only a ticket's latest merge card counts;
- a merged ticket has a `pending` step;
- a stage move has no decision line of its own. A move is `-> <stage>` in a decision, as in `APP-1 todo -> planned`, or `to <stage>`. Its own line has one move, and the only ticket key before the move is that ticket. A key after the move is context. Every stage from `planned` to the ticket's current one needs one, and an `off_path` ticket needs only its `off_path` line.

Each line starts with the ticket key.

## Run

```sh
cd apps/board
vp test run evals/board-claims
```

Free. It runs in CI with the rest of `vp test run`. A case passes when `checkClaims` returns exactly its `expected` lines for its ticket, and the whole output equals every case's lines in order.

## Add a case

The fixture is one board, `acme` for `acme/app`, in `fixture/`. Add a ticket to `fixture/tickets.json` with one claim left unbacked, its card in `fixture/foryou.jsonl`, its evidence in `fixture/artifacts/<key>/`, and a decision line for each stage move. Then add a row to `cases.ts` with the ticket key, a `source`, and the literal lines you expect. `APP-1` and `APP-2` are the controls.
