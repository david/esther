# Deploy — PR merge / 2026-04-28

## Verdict
- shipped

## Preconditions checked
- Issue lane before move: `.issues/lanes/in-progress/94dtw-processor-typing`.
- PR 8 was open, non-draft, mergeable, and had passing CI before merge.
- Implementation tasks complete: `impl/checkpoints/01.md` through `impl/checkpoints/04.md` recorded.
- Review: `review/diff/01-review-diff.md` found no actionable review findings.
- Gates: `review/findings/01-gate-results.md` passed.
- QA: `qa/summary.md` passed 3/3 tasks, 0 failed, 0 skipped.
- Destination lane did not already exist: `.issues/lanes/done/94dtw-processor-typing` was absent.

## Commands run

```bash
git status --short --branch
gh pr view 8 --json url,number,state,mergedAt,mergeCommit,headRefName,baseRefName,mergeStateStatus,isDraft,reviewDecision,statusCheckRollup
gh pr merge 8 --merge --delete-branch --subject "feat(core): improve processor read typing" --body "Merge processor/read-model descriptor read typing and validation updates."
gh pr merge 8 --squash --delete-branch --subject "feat(core): improve processor read typing" --body "Strengthen descriptor read typing for processors and read-model event bindings.\n\nValidate read-model get/query descriptor rows before handler execution and document stricter ReadModelSchemaError behavior."
gh pr merge 8 --rebase --delete-branch
gh pr view 8 --json url,number,state,mergedAt,mergeCommit,headRefName,baseRefName
git fetch origin
git rebase origin/main
```

Notes:
- Merge and squash merge attempts failed because repository disallows those merge methods.
- Rebase merge succeeded.

## PR / deploy links
- PR: https://github.com/david/esther/pull/8
- PR state: merged.
- Merge commit reported by GitHub: `5f449a4a6e8deb68a90b13a3f3c366c7cc4cdafc`.
- Merged at: `2026-04-28T11:42:41Z`.
- Staging deploy/release: not run; repo docs define no staging deployment command.

## QA and gate evidence
- `bun run test`: pass — 259 tests, 0 fail, 639 expectations across 21 files.
- `bun run lint`: pass — ESLint passed with `--max-warnings=0`; dependency-cruiser found no dependency violations across 57 modules / 174 dependencies.
- `bun run typecheck`: pass — `tsgo --noEmit -p tsconfig.json` completed successfully.
- QA summary: `qa/summary.md` passed all tasks.
- GitHub CI check on PR before merge: success.

## Migration / rollout notes
- No event, persistence, adapter storage, or migration changes.
- Runtime behavior is stricter for malformed projection rows: descriptor `get`/`query` rows now fail fast with `ReadModelSchemaError` before processor/read-model event handlers run.
- If downstream apps contain corrupted projection rows, processors/read-model event hooks may now fail before effects/projections execute. This is intended validation behavior and documented in `llms.txt`.

## Lane move
- from: `.issues/lanes/in-progress/94dtw-processor-typing`
- to: `.issues/lanes/done/94dtw-processor-typing`
- status: moved after this artifact was written and PR merge evidence was recorded.

## Project-board review handoff
- status: not applicable
- evidence or exact UI action needed: repo docs define no project-board integration for this issue.

## External issue closure
- status: not applicable
- reason: no separate external GitHub issue was recorded for this local workflow item; PR 8 is merged.

## Next step
No workflow action required for `94dtw-processor-typing`.
