# QA Context — qa-removed-root-internals

## Dependency context
- Depends on `qa-root-public-positive-imports`: passed.

## Task correction
- Tightened source search before execution so comment-only `Step` text in `src/index.ts` does not falsely fail the test.
- Effective removed-export inspection command checks runtime-internal names plus `type Step\b`.

## Commands
```bash
rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|StepError|InlineResult|type Step\\b" src/index.ts || true
rg -n "removedExecuteCommand|RemovedProjectionStore|removedSliceDeps|@ts-expect-error runtime executors|@ts-expect-error projection stores|@ts-expect-error slice dependency" src/__tests__/type-check.ts
bun run typecheck
```
