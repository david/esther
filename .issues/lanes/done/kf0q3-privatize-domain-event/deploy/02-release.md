# Deploy — PR merged and lane moved 2026-04-28

## Verdict
- shipped

## Preconditions checked
- Issue lane before move: `.issues/lanes/in-progress/kf0q3-privatize-domain-event`.
- PR: https://github.com/david/esther/pull/9.
- PR state: `MERGED`.
- Merge method: rebase merge, per user request.
- Merge commit / resulting main tip: `9bd871d6995ced46a374396619041ddc54487268`.
- GitHub CI `check`: `SUCCESS` before merge.
- Gates: `review/findings/01-gate-results.md` passed.
- QA: `qa/summary.md` passed; no manual QA remaining.
- Destination lane did not exist before move.

## Commands run
- `gh pr merge 9 --rebase --delete-branch`
- `gh pr view 9 --json url,state,mergedAt,mergeCommit,headRefName,baseRefName,statusCheckRollup`
- `git fetch origin && git rebase origin/main`
- `git status --short --branch`

## PR / deploy links
- PR: https://github.com/david/esther/pull/9
- State: `MERGED`
- Merged at: `2026-04-28T21:40:47Z`
- Main tip after rebase merge: `9bd871d6995ced46a374396619041ddc54487268`
- Release/deploy: not applicable; library repo has no documented staging deploy flow.

## QA and gate evidence
- `review/findings/01-gate-results.md`: `bun run test`, `bun run lint`, and `bun run typecheck` passed.
- `qa/summary.md`: QA passed with `bun run typecheck`, `bun run lint`, and `bun run test`.
- GitHub CI `check`: completed with `SUCCESS` on PR.

## Migration / rollout notes
- Breaking TypeScript API cleanup: root `DomainEvent` export removed.
- Replacement guidance: app authors use `defineEvent(...)` + `EventOf<typeof Definition>`; custom store authors use low-level `EventRecordInput`.
- Runtime persisted event shape unchanged.
- No migrations, backfills, deploy ordering, or replay work.

## Lane move
- from: `.issues/lanes/in-progress/kf0q3-privatize-domain-event`
- to: `.issues/lanes/done/kf0q3-privatize-domain-event`
- status: moved

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: repo docs define no external project-board workflow.

## External issue closure
- status: left open; no external issue linked in `description.md`, and no explicit external closure requested.

## Next step
No workflow action required for repo-local issue. External closure not applicable unless user links one.
