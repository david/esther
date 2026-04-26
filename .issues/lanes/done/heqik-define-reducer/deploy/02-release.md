# Deploy — merged to main 2026-04-26

## Verdict
- shipped

## Preconditions checked
- PR 6 was open, non-draft, mergeable, and CI passed before merge.
- Merge state before merge: `CLEAN`.
- Required check before merge: GitHub Actions `CI / check` completed successfully.
- Issue destination `.issues/lanes/done/heqik-define-reducer` did not exist before lane move.
- Local branch after merge: `main` at `f9d4bb8`, matching `origin/main`.

## Commands run
- `git status --short --branch`
- `gh pr view 6 --json title,url,state,mergeStateStatus,isDraft,reviewDecision,statusCheckRollup`
- `gh pr merge 6 --rebase --delete-branch`
- `gh pr view 6 --json state,mergedAt,mergeCommit,url`
- `git rev-parse --short HEAD`
- `git rev-parse --short origin/main`

## PR / deploy links
- PR: https://github.com/david/esther/pull/6
- PR title: `feat(core): add defineReducer API`
- Merge method: rebase merge
- Merged at: 2026-04-26T21:52:04Z
- Merge commit / resulting main HEAD: `f9d4bb80c7bdb7e955a136f5ac7872e9f6cb7563`
- Staging/release deploy: not applicable; repo has no documented staging deploy workflow or `doc/deployment.md`

## QA and gate evidence
- Gate artifact: `review/findings/01-gate-results.md`
- QA summary: `qa/summary.md`
- GitHub Actions `CI / check`: success before merge
- Local full gates recorded before PR:
  - `bun run test`: pass — 243 tests passed, 0 failed, 603 expectations across 19 files
  - `bun run lint`: pass — ESLint and dependency-cruiser passed
  - `bun run typecheck`: pass — `tsgo --noEmit -p tsconfig.json` completed

## Migration / rollout notes
- Breaking API release for consumers.
- Public event-history query surfaces now require `defineReducer(...)` output.
- Raw public `schemas + fold` forms are removed.
- Stored event data, tags, positions, append ordering, and replay ordering unchanged.
- No persistence migration or backfill needed.

## Lane move
- from: `.issues/lanes/in-progress/heqik-define-reducer`
- to: `.issues/lanes/done/heqik-define-reducer`
- status: moved in follow-up workflow commit

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: no repo project-board workflow documented in `doc/workflow.md`, `doc/project-management.md`, or `doc/commands.md`

## External issue closure
- status: left open; no external issue closure requested or documented

## Next step
- Repo-local workflow complete after lane move commit.
