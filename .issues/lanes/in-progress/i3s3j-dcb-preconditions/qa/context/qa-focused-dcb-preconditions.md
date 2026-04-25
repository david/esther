# QA context — qa-focused-dcb-preconditions

Date: 2026-04-25
Mode: agent-executable-non-browser
Setup result: ready

## Preconditions
- Issue resolved to `.issues/lanes/in-progress/i3s3j-dcb-preconditions`.
- Working tree was clean before QA generation began.
- Data migration check: not applicable; repo has no `be/` directory.
- Browser/session setup: none.

## Command
```bash
bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts src/__tests__/pipeline-wiring.test.ts
```
