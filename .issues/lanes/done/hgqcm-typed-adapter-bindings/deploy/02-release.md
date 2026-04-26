# Deploy — PR merge and lane move 2026-04-26

## Verdict
- shipped

## Preconditions checked
- PR: https://github.com/david/esther/pull/4
- PR state before merge: open, merge state `CLEAN`.
- CI before merge: passed on head `088879c1423240cb348ea9960449cf773f554cb3`.
- QA: `qa/summary.md` passed.
- Automated gates: `review/findings/01-gate-results.md` passed.
- Destination lane path did not exist before move: `.issues/lanes/done/hgqcm-typed-adapter-bindings`.

## Commands run
- `git status --short --branch`
- `gh pr view 4 --json number,state,mergeStateStatus,statusCheckRollup,reviewDecision,url,headRefName,baseRefName,headRefOid`
- `gh pr merge 4 --merge --delete-branch` — failed because merge commits are not allowed.
- `gh pr merge 4 --squash --delete-branch --subject "feat(fastify): add typed adapter bindings"` — failed because squash merges are not allowed.
- `gh pr merge 4 --rebase --delete-branch` — succeeded on GitHub; local fast-forward warning was resolved by resetting local `main` to `origin/main` after verifying PR merged.
- `gh pr view 4 --json number,state,mergedAt,mergeCommit,url,headRefName,baseRefName`
- `git reset --hard origin/main`
- `test ! -e .issues/lanes/done/hgqcm-typed-adapter-bindings && echo dest-clear`

## PR / deploy links
- PR: https://github.com/david/esther/pull/4
- PR state: merged
- Merged at: 2026-04-26T17:45:36Z
- Merge/rebase commit on `origin/main`: `5bf6c63546b190e0088d8729f9f18a7f6e41f80f`
- CI: https://github.com/david/esther/actions/runs/24962784900
- Release evidence: repository has no `doc/deployment.md` or staging deploy process; merge to `main` is the recorded release action for this library change.

## QA and gate evidence
- Automated gates passed in `review/findings/01-gate-results.md`:
  - `bun run test`: passed — 236 tests passed, 0 failed, 596 expectations across 18 files.
  - `bun run lint`: passed — ESLint and dependency-cruiser passed.
  - `bun run typecheck`: passed — `tsgo --noEmit -p tsconfig.json` completed successfully.
- PR CI passed on latest head before merge.
- QA passed in `qa/summary.md`:
  - `qa-type-route-contracts`: passed
  - `qa-fastify-runtime-routes`: passed
  - `qa-no-public-typed-client`: passed

## Migration / rollout notes
- Additive public API only.
- No event, read-model, persistence, migration, replay, processor, or effect changes.
- Existing dynamic dispatch and Fastify wildcard users remain compatible.

## Lane move
- from: `.issues/lanes/in-progress/hgqcm-typed-adapter-bindings`
- to: `.issues/lanes/done/hgqcm-typed-adapter-bindings`
- status: moved in follow-up commit after this artifact was written.

## Project-board review handoff
- status: not applicable; no repo-documented project-board workflow found.

## External issue closure
- status: left open; no external issue closure was requested and no linked external issue was identified.

## Next step
- None for repo-local deploy. External issue/project-board closure remains a separate explicit action if needed.
