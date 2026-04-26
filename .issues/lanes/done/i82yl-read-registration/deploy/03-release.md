# Deploy — merge/main 2026-04-26

## Verdict
- shipped

## Preconditions checked
- PR CI passed before merge.
- PR was mergeable and open before merge.
- QA passed with 0 failures and 0 skips.
- Full local gate evidence passed before PR creation.
- No migrations, backfills, event replay, or deploy sequencing were required.

## Commands run

```bash
gh pr checks 3 --watch --interval 10
gh pr merge 3 --merge --delete-branch      # failed: merge commits not allowed
gh pr merge 3 --squash --delete-branch     # failed: squash merges not allowed
gh pr merge 3 --rebase --delete-branch
gh pr view 3 --json state,mergedAt,mergeCommit,url,statusCheckRollup
git reset --hard origin/main
git push origin --delete i82yl-read-registration # remote already deleted by gh
git fetch --prune origin
git mv .issues/lanes/in-progress/i82yl-read-registration .issues/lanes/done/i82yl-read-registration
git commit -m "chore(workflow): move read registration issue to done"
git push origin main
```

## PR / deploy links
- PR: https://github.com/david/esther/pull/3
- PR state: merged
- Merge method: rebase merge
- Merged at: `2026-04-26T13:25:14Z`
- Main/merge commit reported by GitHub: `6448b014160562dc3ae86cb80b334fe3efac776c`
- CI: `check` completed successfully

## QA and gate evidence
- Gate artifact: `.issues/lanes/done/i82yl-read-registration/review/findings/01-gate-results.md`
  - `bun run test`: passed — 227 tests across 18 files, 0 failures, 562 assertions.
  - `bun run lint`: passed — ESLint and dependency-cruiser passed.
  - `bun run typecheck`: passed.
- QA artifact: `.issues/lanes/done/i82yl-read-registration/qa/summary.md`
  - verdict: passed
  - failed: 0
  - skipped: 0
  - CLI gaps: none

## Migration / rollout notes
- No database migrations, data backfills, event replay, or deploy sequencing required.
- Runtime/public API change is now on `main`.
- Legacy `projectionAdapters` and `projectionQuery` compatibility remains.

## Lane move
- from: `.issues/lanes/in-progress/i82yl-read-registration`
- to: `.issues/lanes/done/i82yl-read-registration`
- status: moved after PR #3 merged to `main`; this follow-up commit records release evidence and the lane move.

## Project-board review handoff
- status: not applicable; no project-board workflow is documented for this repo.

## External issue closure
- status: left open/not applicable; no external issue closure was requested or documented.

## Next step
Repo-local deploy is complete.
