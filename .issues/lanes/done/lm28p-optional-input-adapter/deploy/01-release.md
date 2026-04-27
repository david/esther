# Deploy — direct push to main / 2026-04-27

## Verdict
- shipped

## Preconditions checked
- issue existed in `.issues/lanes/in-progress/lm28p-optional-input-adapter`
- implementation checkpoints complete through `impl/checkpoints/03.md`
- semantic diff review passed with no actionable findings in `review/diff/01-review-diff.md`
- automated gates passed in `review/findings/01-gate-results.md`
- QA passed in `qa/summary.md`
- worktree was clean before deploy
- user explicitly selected direct push path after branch was found on `main`

## Commands run
- `git push origin main`
- `git status --short --branch && git rev-parse HEAD && git ls-remote --heads origin main`

## PR / deploy links
- PR: not used; user selected direct push to `main`
- pushed commit: `0b27a0f47b1aa27e33dc82574df6d99d507049de`
- remote: `origin/main` at `0b27a0f47b1aa27e33dc82574df6d99d507049de`

## QA and gate evidence
- gates: `review/findings/01-gate-results.md` — passed (`bun run test`, `bun run lint`, `bun run typecheck`)
- QA: `qa/summary.md` — passed (`bun run typecheck`, `bun test src/core/app.test.ts`)

## Migration / rollout notes
- Additive TypeScript API change only.
- No migration, persistence change, event replay change, or external adapter change.
- Release note: `createApp()` no longer requires `inputAdapter`; direct `app.dispatch()` works without transport binding, and `start()` / `stop()` are no-ops when no adapter exists.

## Lane move
- from: `.issues/lanes/in-progress/lm28p-optional-input-adapter`
- to: `.issues/lanes/done/lm28p-optional-input-adapter`
- status: moved after direct push evidence recorded

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: repo docs define no project board integration for this issue

## External issue closure
- status: left open / not applicable
- reason: no external GitHub issue was linked in issue artifacts; skill default does not infer external closure from deploy

## Next step
No workflow skill required. If external tracker exists, close/review it manually with this deploy artifact as evidence.
