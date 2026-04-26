# Deploy — merge and lane move / 2026-04-26

## Verdict
- shipped

## Preconditions checked
- issue lane before move: `.issues/lanes/in-progress/9jzss-public-runtime-surface`
- implementation tasks: complete via `impl/checkpoints/01.md` and `impl/checkpoints/02.md`
- review: `review/diff/01-review-diff.md` found no actionable findings
- gates: passed on PR branch; GitHub CI check `check` succeeded
- QA: `qa/summary.md` verdict passed, 3 passed / 0 failed / 0 skipped
- PR: #5 was merged to `main`
- destination lane: `.issues/lanes/done/9jzss-public-runtime-surface` did not exist before move

## Commands run
- `gh pr merge 5 --rebase --delete-branch`
- `gh pr view 5 --json number,state,mergedAt,mergeCommit,url,headRefName,baseRefName,statusCheckRollup`
- `git fetch origin main --prune`
- `git worktree add -b deploy/9jzss-public-runtime-surface-done /tmp/esther-w0-done-9jzss origin/main`
- `gh pr view 5 --json number,state,mergedAt,mergeCommit,url,headRefName,baseRefName,statusCheckRollup`

## PR / deploy links
- PR: https://github.com/david/esther/pull/5
- PR state: `MERGED`
- Merge method: rebase
- Merged at: 2026-04-26T20:46:36Z
- Merge commit / resulting main head: `8c0c6dda56eb2691c26b02e6e42207c25cf6e276`
- CI: GitHub Actions `check` succeeded at https://github.com/david/esther/actions/runs/24966498576/job/73102115123

## QA and gate evidence
- `review/findings/01-gate-results.md`: passed
- `qa/summary.md`: passed, 3 passed / 0 failed / 0 skipped
- PR CI `check`: success

## Migration / rollout notes
- No persistence migrations, replay, event schema, auth, adapter runtime, processor, or read-model behavior changes.
- Breaking TypeScript root export cleanup for pre-1.0 package consumers.
- Rollout note: `release-notes/root-export-surface.md` lists removed root exports and supported alternatives.

## Lane move
- from: `.issues/lanes/in-progress/9jzss-public-runtime-surface`
- to: `.issues/lanes/done/9jzss-public-runtime-surface`
- status: moved

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: no repo project-board workflow documented for this issue

## External issue closure
- status: left open; no external GitHub issue linked, and deploy skill does not infer external closure from PR merge
- review/approval evidence when closure is performed: not applicable

## Next step
No repo-local deploy action remains for this issue.
