# Deploy — merge and lane move / 2026-04-28

## Verdict
- shipped

## Preconditions checked
- issue lane before move: `.issues/lanes/in-progress/bs43i-tighten-query-where`
- implementation tasks: complete via `impl/checkpoints/01.md` through `impl/checkpoints/04.md`
- semantic review: complete with no code follow-up findings in `review/diff/01-review-diff.md`
- gates: passed in `review/findings/01-gate-results.md`
- QA: passed in `qa/summary.md`, 3 passed / 0 failed / 0 blocked / 0 skipped
- PR: #10 merged to `main`
- CI: GitHub Actions `check` succeeded on PR head
- destination lane: `.issues/lanes/done/bs43i-tighten-query-where` did not exist before move

## Commands run
- `gh pr checks 10 --watch --interval 10 --fail-fast`
- `gh pr merge 10 --rebase --delete-branch`
- `gh pr view 10 --json number,state,mergedAt,mergeCommit,url,headRefName,baseRefName,statusCheckRollup`
- `git fetch origin --prune`
- `git status --short --branch`
- `git rev-list --left-right --count origin/main...HEAD`
- `git rebase origin/main`
- `git rev-parse HEAD`
- `git rev-parse origin/main`

## PR / deploy links
- PR: https://github.com/david/esther/pull/10
- PR state: `MERGED`
- Merge method: rebase
- Merged at: 2026-04-28T23:26:34Z
- Merge commit / resulting main head: `a11a035481f9363d221953825028feed00a70cc9`
- CI: GitHub Actions `check` succeeded at https://github.com/david/esther/actions/runs/25082895596/job/73491873489

## QA and gate evidence
- gates: `review/findings/01-gate-results.md` — passed (`bun run test`, `bun run lint`, `bun run typecheck`)
- QA: `qa/summary.md` — passed; `bun run typecheck`, `bun test src/core/read-model.test.ts`, `bun run test`, `bun run lint`, and `bun run typecheck` passed
- PR CI `check`: success

## Migration / rollout notes
- Breaking compile-time tightening for unsupported read-model `where` clauses.
- Runtime behavior changes from silent broad query or adapter-dependent filtering to fail-fast for unsafe/bypassed unsupported clauses.
- No data migration, persistence schema change, event replay migration, adapter deployment order, or backfill.

## Lane move
- from: `.issues/lanes/in-progress/bs43i-tighten-query-where`
- to: `.issues/lanes/done/bs43i-tighten-query-where`
- status: moved

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: no repo project-board workflow documented for this issue

## External issue closure
- status: left open; no external GitHub issue linked, and deploy skill does not infer external closure from PR merge
- review/approval evidence when closure is performed: not applicable

## Next step
No repo-local deploy action remains for this issue.
