# Implementation task protocol

Use this protocol when implementing numbered `.issues` tasks from an issue's
`impl/` directory.

## Task selection

- Numbered implementation tasks are `impl/NN.md`.
- Generated logs belong under `impl/output/`.
- Durable implementation checkpoints belong under `impl/checkpoints/NN.md`.
- A task is complete only when its checkpoint exists with status `aligned` or
  `minor-local-drift`.
- If a checkpoint is `high-risk-drift` or `blocked`, stop and route to the
  appropriate planning, drift, or debug step before continuing later tasks.

## Implementation scope

- Implement one task per run.
- Read the task and every source artifact it names before editing code.
- Follow the task's scope, acceptance criteria, suggested tests, and verification
  commands.
- Do not silently broaden into later tasks.
- If a new high-risk behavior, contract, migration/replay, auth, side-effect,
  rollout, or verification issue appears, stop and checkpoint the task as
  `high-risk-drift` or `blocked`.

## Checkpoint format

Write `impl/checkpoints/NN.md` before finishing a task:

```md
# NN — Implementation checkpoint

Status: aligned | minor-local-drift | high-risk-drift | blocked
Task: impl/NN.md
Date: YYYY-MM-DD

## Summary
- what changed for this task

## Files changed
- `path`: reason

## Verification
- `command`: pass/fail/not-run — evidence or reason

## Drift assessment
- comparison against the task, source artifact, and relevant plan-check watch items

## Follow-ups
- none, or concrete follow-up needed
```

## Handoff

- If another task is pending, continue with `{{/skill:impl <issue-ref> --task NN}}`.
- If all implementation tasks are complete, continue with `{{/skill:review-diff <issue-ref>}}`.
- If blocked or high-risk drift is recorded, hand off to the most precise owner,
  usually `{{/skill:drift <issue-ref>}}`, `{{/skill:debug <issue-ref>}}`, or
  `{{/skill:plan <issue-ref>}}`.
