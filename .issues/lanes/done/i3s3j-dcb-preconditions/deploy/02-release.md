# Deploy — direct-push/2026-04-25

## Verdict
- shipped

## Preconditions checked
- User explicitly confirmed direct-push option `1` after preflight warning.
- Branch: `main`.
- Upstream: `origin/main`.
- Pre-push sync: `git fetch origin` completed; branch was ahead only, not behind.
- Working tree was clean before push.
- Implementation checkpoints complete and aligned: `impl/checkpoints/01.md` through `impl/checkpoints/04.md`.
- Plan check approved: `plan/checks/02-plan-sanity.md`.
- Review present: `review/diff/01-review-diff.md`.
- Automated gates passed: `review/findings/01-gate-results.md`.
- QA passed: `qa/summary.md`.

## Commands run
```bash
git fetch origin
git status --short --branch
git log --oneline --left-right --graph origin/main...HEAD
git push origin main
```

## PR / deploy links
- Direct push to `origin/main` succeeded.
- Pushed range: `814f15f..c127784`.
- Final pushed commit at first deploy push: `c127784 chore(deploy): record DCB precondition preflight`.
- No PR was created because the user explicitly chose direct push.

## QA and gate evidence
- `review/findings/01-gate-results.md`: passed `bun run test`, `bun run lint`, and `bun run typecheck`.
- `qa/results/qa-focused-dcb-preconditions.md`: focused DCB tests passed (`60 pass`, `0 fail`).
- `qa/results/qa-full-library-gates.md`: full gates passed (`209 pass`, `0 fail`).
- `qa/summary.md`: QA verdict passed, with 2 passed / 0 failed / 0 skipped.

## Migration / rollout notes
- No schema migration, data migration, event replay, read-model rebuild, or adapter setup change required.
- Behavior-tightening release: stale command writes that previously succeeded may now return `ConcurrencyError`.
- New public/framework error surface: multi-observation command-side event-history reads may return `BoundaryObservationError`.
- Postgres appends now use a transaction-scoped global advisory lock; correctness improves while write parallelism may be reduced.

## Lane move
- from: `.issues/lanes/in-progress/i3s3j-dcb-preconditions`
- to: `.issues/lanes/done/i3s3j-dcb-preconditions`
- status: pending in this artifact; completed by the follow-up lane-move commit.

## Next step
- Move issue to done and push lane-move evidence.
