# Deploy — merge and lane move 2026-04-27

## Verdict
- shipped

## Preconditions checked
- PR: https://github.com/david/esther/pull/7
- PR state before merge: open, mergeable
- CI before merge: pass — https://github.com/david/esther/actions/runs/25006362482/job/73230112750
- implementation tasks: complete; 0 pending per `index.md`
- review: `review/diff/01-review-diff.md`; no actionable findings
- gates: passed per `impl/checkpoints/04.md`
- QA: passed per `qa/summary.md`
- destination lane directory: `.issues/lanes/done/y7pbl-event-definition` did not exist

## Commands run

```bash
git status -sb
gh pr view 7 --json url,state,mergeable,statusCheckRollup,headRefOid,baseRefName,headRefName
gh pr merge 7 --merge --delete-branch
gh pr merge 7 --squash --delete-branch --subject "feat(core): add event definitions" --body "Add defineEvent helper with derived event schemas, constructors, and exported type helpers. Cover reducer, read-model, processor, and type inference paths; record workflow review, QA, and deploy artifacts."
gh pr merge 7 --rebase --delete-branch
gh pr view 7 --json state,mergedAt,mergeCommit,url,headRefName,baseRefName,statusCheckRollup
git reset --hard origin/main
git push origin --delete y7pbl-event-definition 2>&1 || true
git remote prune origin
```

Important output:

```text
GraphQL: Merge commits are not allowed on this repository. (mergePullRequest)
GraphQL: Squash merges are not allowed on this repository. (mergePullRequest)
state: MERGED
mergedAt: 2026-04-27T16:58:26Z
mergeCommit: 46657d75e975687a8bcdd1f93a797cdd7f5ed028
HEAD is now at 46657d7 chore(workflow): record event definition PR
error: unable to delete 'y7pbl-event-definition': remote ref does not exist
[pruned] origin/y7pbl-event-definition
```

## PR / deploy links
- PR: https://github.com/david/esther/pull/7
- merged commit on `main`: `46657d75e975687a8bcdd1f93a797cdd7f5ed028`
- CI check used for merge: https://github.com/david/esther/actions/runs/25006362482/job/73230112750

## QA and gate evidence
- QA summary: `qa/summary.md`
- Implementation gate evidence: `impl/checkpoints/04.md`
- Review evidence: `review/diff/01-review-diff.md`
- Deploy PR evidence: `deploy/01-pr.md`

## Migration / rollout notes
- Additive public API only.
- No stored event shape change.
- No persistence migration, replay reset, checkpoint reset, adapter rollout, or deploy ordering needed.
- Existing raw Zod event schemas and `DomainEvent` aliases remain supported.

## Lane move
- from: `.issues/lanes/in-progress/y7pbl-event-definition`
- to: `.issues/lanes/done/y7pbl-event-definition`
- status: moved after this artifact was written

## Project-board review handoff
- status: not applicable; no repo-documented project board or linked external board item found
- evidence or exact UI action needed: none

## External issue closure
- status: left open; no linked external GitHub issue found and no separate external closure requested
- review/approval evidence when closure is performed: not applicable

## Next step
No repo-local action pending.
