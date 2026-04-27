# QA Context — qa-contract-evidence

Date: 2026-04-27
Issue: `.issues/lanes/in-progress/y7pbl-event-definition`
Mode: agent-executable-non-browser

## Preflight

```bash
git status --porcelain
```

Result: clean before QA artifacts were written.

```bash
cd be && bun run migrate:data:check
```

Result: not applicable. Repo has no `be/` directory and root `package.json` has no `migrate:data:check` script.

## Setup state
- Browser session: none.
- URL/page: not applicable.
- CLI working directory: `/home/david/esther-w0`.
- Setup data: none required; framework library API change only.
- Manual/browser QA need: none found in plan, implementation checkpoints, or review digest.

## Commands selected
- `bun test src/core/event.test.ts src/core/read-model.test.ts src/core/processor.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
