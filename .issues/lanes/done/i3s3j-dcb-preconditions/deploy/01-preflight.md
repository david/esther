# Deploy — preflight/2026-04-25

## Verdict
- blocked

## Preconditions checked
- Issue is in `.issues/lanes/in-progress/i3s3j-dcb-preconditions`.
- Implementation tasks complete: `impl/checkpoints/01.md` through `impl/checkpoints/04.md` are aligned.
- Plan check approved: `plan/checks/02-plan-sanity.md`.
- Semantic review present: `review/diff/01-review-diff.md`.
- Automated gates passed: `review/findings/01-gate-results.md` and QA full-gate rerun.
- QA passed: `qa/summary.md` reports 2 passed, 0 failed, 0 skipped.
- Migration/rollout: no data migration; no `be/` directory exists for `bun run migrate:data:check`.
- Repo status at preflight: clean before writing this deploy artifact.

## Commands run
```bash
git status --short --branch
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git log --oneline origin/main..HEAD
```

Observed branch state:
```text
## main...origin/main [ahead 6]
upstream: origin/main
```

Ahead commits at preflight:
```text
fe7a0a1 test(qa): record DCB precondition QA results
cec5610 chore(issues): file adapter conformance follow-up
e37bf08 feat(core): enforce DCB append preconditions
dac2c5c docs: add implementation protocol and cohesion guidance
3165e05 docs(workflow): add issue lanes and backlog items
da6d3a4 rename slice APIs to command/query terms
```

## PR / deploy links
- None yet.
- Blocked before `git push` because current branch is `main` and pushing would be a direct push to `origin/main`.

## QA and gate evidence
- `review/findings/01-gate-results.md`: `bun run test`, `bun run lint`, and `bun run typecheck` passed.
- `qa/summary.md`: QA passed.
- `qa/results/qa-focused-dcb-preconditions.md`: focused DCB tests passed (`60 pass`, `0 fail`).
- `qa/results/qa-full-library-gates.md`: full gates passed (`209 pass`, `0 fail`).

## Migration / rollout notes
- No schema migration, data migration, event replay, read-model rebuild, or adapter setup change required.
- Rollout is behavior-tightening: stale command writes that previously succeeded may now return `ConcurrencyError`; multi-observation command-side event-history reads may return `BoundaryObservationError`.
- Postgres appends now use a transaction-scoped global advisory lock, reducing write parallelism for correctness.

## Lane move
- from: `.issues/lanes/in-progress/i3s3j-dcb-preconditions`
- to: not moved; blocked before push/PR/deploy confirmation.

## Next step
Confirm whether to direct-push `main` to `origin/main`, or ask for a feature branch / PR flow instead.
