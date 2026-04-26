# Removed root runtime internals stay unavailable

status: pending
role: developer
browser_session: none
depends_on:
  - qa-root-public-positive-imports
mode: agent-executable-non-browser

## Goal
Verify removed runtime-internal symbols are not exported from the `esther` package root and representative negative API assertions still typecheck.

## Setup Notes
- Run from repository root.
- No browser, database, network service, or manual fixture setup required.
- Reuse `src/index.ts` and `src/__tests__/type-check.ts` as source/API sentinels.

## Start
- URL: CLI repository root
- Page: terminal

## Steps
1. Page: terminal at repository root
   Inspect: `src/index.ts`
   Action: run `rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|Step|StepError|InlineResult" src/index.ts || true`
   Expect: no output; none of the removed root export names appear in `src/index.ts`.
2. Page: terminal at repository root
   Inspect: `src/__tests__/type-check.ts` negative assertions
   Action: run `rg -n "removedExecuteCommand|RemovedProjectionStore|removedSliceDeps|@ts-expect-error runtime executors|@ts-expect-error projection stores|@ts-expect-error slice dependency" src/__tests__/type-check.ts`
   Expect: output includes negative assertion anchors for `executeCommand`, `ProjectionStore`, and `SliceDeps`.
3. Page: terminal at repository root
   Inspect: TypeScript compile output
   Action: run `bun run typecheck`
   Expect: command exits 0, proving negative assertions are active and no removed root export is available.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Runtime executors removed | `src/index.ts` | `executeCommand`, `executeQuery` | No `rg` matches | Use `createApp().dispatch` or adapters instead |
| Read interpreter internals removed | `src/index.ts` | `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps` | No `rg` matches | `createApp()` owns wiring |
| Projection/store/deps internals removed | `src/index.ts` | `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation` | No `rg` matches | Internal modules may still define them |
| Low-level step/result internals removed | `src/index.ts` | `Step`, `StepError`, `InlineResult` | No `rg` matches | Watch-item descriptor types may remain separately |
| Negative compile assertions | `src/__tests__/type-check.ts` | `executeCommand`, `ProjectionStore`, `SliceDeps` | Assertions present and `bun run typecheck` passes | Guards representative removals |

## Pass Criteria
- Removed root export name search returns no matches in `src/index.ts`.
- Negative assertion anchors exist for representative removed root exports.
- `bun run typecheck` exits 0.

## Failure Capture
- failing step number
- command output
- matching line from `src/index.ts` or missing negative assertion line
- TypeScript diagnostic if typecheck fails
- current git commit hash from `git rev-parse --short HEAD`
