# Deploy — preflight 2026-05-01

## Verdict
- shipped

## Preconditions checked
- Issue path exists in `.issues/lanes/in-progress/ub781-event-tag-guard`.
- Destination `.issues/lanes/done/ub781-event-tag-guard` absent before lane move.
- Implementation tasks complete per `index.md` and checkpoints.
- Semantic diff review complete with no actionable findings.
- QA summary says no executable QA tasks needed for this library-level change.
- Repo docs say default ship path is direct push to `origin/main`, no PR unless explicitly requested.
- Worktree clean before deploy artifact write.
- Branch `main` fetched from origin and was 12 commits ahead, 0 behind.

## Commands run
- `git rev-parse --show-toplevel`
- `git status --short`
- `find .issues/lanes -maxdepth 3 -type d -name 'ub781-event-tag-guard' -print`
- `grep -RInE 'Deploy mode|PR:|No PR|done-only|deferred' .issues/lanes/in-progress/ub781-event-tag-guard || true`
- `git status --short --branch`
- `git log --oneline --decorate --max-count=12`
- `git fetch origin`
- `git rev-list --left-right --count HEAD...origin/main` → `12 0`
- `bun run typecheck` → passed
- `bun run lint` → passed
- `bun run test` → passed, 291 pass, 0 fail, 747 expect calls across 21 files

## PR / deploy links
- PR: not applicable; repo docs say direct push to `origin/main` unless explicitly requested.
- Push/deploy link: pending `git push origin HEAD:main`; record in release artifact after push.

## QA and gate evidence
- `review/findings/01-gate-results.md`: gates passed.
- `qa/summary.md`: QA planned; no executable QA tasks created; automated gates enough.
- Re-run during deploy: `bun run typecheck && bun run lint && bun run test` passed.

## Migration / rollout notes
- No database/file migration.
- No stored event shape, replay, or adapter append option change.
- Behavior is stricter: commands that observe DCB tags must emit events containing all observed tags or fail with `EventTagMismatchError`.

## Lane move
- from: `.issues/lanes/in-progress/ub781-event-tag-guard`
- to: `.issues/lanes/done/ub781-event-tag-guard`
- status: moved before direct push to `origin/main`; no PR requested

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: repo docs expose no project-board workflow for this issue

## External issue closure
- status: left open; no external issue closure requested and no external issue reference found
- review/approval evidence when closure is performed: not applicable

## Next step
`git push origin HEAD:main`
