# QA Context — qa-root-public-positive-imports

## Preflight
- `git status --porcelain`: clean before QA execution.
- `cd be && bun run migrate:data:check`: non-applicable because this repo has no `be/` directory.

## Commands
```bash
rg -n "BoundaryObservationError|createApp|defineCommand|defineQuery|defineReadModel|defineReadModelQuery|createInMemoryAdapter|ProjectionAdapter|OperationInput|OperationResult" src/__tests__/type-check.ts
bun run typecheck
```
