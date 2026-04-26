# Root public API positive imports compile

status: pending
role: developer
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify supported root public API imports still typecheck through the public API sentinel.

## Setup Notes
- Run from repository root.
- Use existing `src/__tests__/type-check.ts` as the public API compile sentinel.
- No browser, database, network service, or manual fixture setup required.

## Start
- URL: CLI repository root
- Page: terminal

## Steps
1. Page: terminal at repository root
   Inspect: `src/__tests__/type-check.ts` import list from `../index`
   Action: run `rg -n "BoundaryObservationError|createApp|defineCommand|defineQuery|defineReadModel|defineReadModelQuery|createInMemoryAdapter|ProjectionAdapter|OperationInput|OperationResult" src/__tests__/type-check.ts`
   Expect: output includes these supported root-public names: `BoundaryObservationError`, `createApp`, `defineCommand`, `defineQuery`, `defineReadModel`, `defineReadModelQuery`, `createInMemoryAdapter`, `ProjectionAdapter`, `OperationInput`, `OperationResult`.
2. Page: terminal at repository root
   Inspect: TypeScript compile output
   Action: run `bun run typecheck`
   Expect: command exits 0 with `tsgo --noEmit -p tsconfig.json` success and no TypeScript errors.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| App composition | `src/__tests__/type-check.ts` import from `../index` | `createApp`, `AppConfig` | Present in sentinel and typecheck passes | Stable root API kept |
| Command/query DSL | `src/__tests__/type-check.ts` import from `../index` | `defineCommand`, `defineQuery`, `compose`, `state` | Present in sentinel and typecheck passes | Stable root API kept |
| Read-model DSL/contracts | `src/__tests__/type-check.ts` import from `../index` | `defineReadModel`, `defineReadModelQuery`, `ProjectionAdapter`, `ReadModelRegistration` | Present in sentinel and typecheck passes | Extension API kept |
| Error/detail contracts | `src/__tests__/type-check.ts` import from `../index` | `BoundaryObservation`, `BoundaryObservationError`, `SliceError` | Present in sentinel and typecheck passes | Public error details kept |
| Operation helper types | `src/__tests__/type-check.ts` import from `../index` | `OperationInput`, `OperationOutput`, `OperationError`, `OperationResult` | Present in sentinel and typecheck passes | Typed adapter support kept |

## Pass Criteria
- `rg` confirms representative supported root imports exist in the type-check sentinel.
- `bun run typecheck` exits 0.

## Failure Capture
- failing step number
- command output
- missing import name or TypeScript diagnostic
- current git commit hash from `git rev-parse --short HEAD`
