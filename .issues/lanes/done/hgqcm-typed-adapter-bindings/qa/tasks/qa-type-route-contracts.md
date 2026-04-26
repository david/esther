# Type-level route binding contracts

status: pending
role: agent
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Confirm the public type-check suite proves typed adapter route bindings accept known command/query slices, reject unknown or mismatched routes, expose typed response results, and preserve dynamic dispatch.

## Setup Notes
- Repository checkout: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/hgqcm-typed-adapter-bindings`.
- No browser, database, service, or fixture data required.
- Use only documented CLI checks: `bun run typecheck`.
- Inspect `src/__tests__/type-check.ts` anchors listed below.

## Start
- URL: n/a
- Page: repository shell at `/home/david/esther-w0`

## Steps
1. Page: repository shell.
   Inspect: `src/__tests__/type-check.ts` section `// ── Operation helper type flow`.
   Action: confirm it declares `_typedNamedCommand`, `_typedNamedQuery`, `_typedOperations`, and assertions for `OperationName`, `OperationByName`, `OperationInput`, `OperationOutput`, `OperationError`, and `OperationResult`.
   Expect: command and query names are preserved as `"typed-command"` and `"typed-query"`; helper assertions cover command and query input/output/error/result types.
2. Page: repository shell.
   Inspect: `src/__tests__/type-check.ts` section `// ── Typed Fastify route bindings`.
   Action: confirm it calls `defineFastifyRoutes<typeof _typedOperations>()` with one `POST` command route and one `GET` query route.
   Expect: the command route uses `slice: "typed-command"` and returns `{ commandId: "command-1" }`; the query route uses `slice: "typed-query"` and returns `{ queryId: "query-1" }`.
3. Page: repository shell.
   Inspect: the same section.
   Action: confirm negative `@ts-expect-error` examples exist for `slice: "missing-slice"`, command route returning query input, query route returning command input, and missing operation lookup.
   Expect: each negative example is present and would fail if the type contract stopped rejecting invalid bindings.
4. Page: repository shell.
   Inspect: `respond` callbacks in `_typedFastifyRoutes`.
   Action: confirm the command `respond` checks `Result<TypedCommandOutput, SliceError | TypedCommandError>` and rejects assignment to the query result type; confirm the query `respond` checks `Result<TypedQueryOutput, SliceError | TypedQueryError>`.
   Expect: response override typing is selected by route `slice`.
5. Page: repository shell.
   Inspect: the bottom dynamic-dispatch assertions in `src/__tests__/type-check.ts`.
   Action: confirm `_dynamicDispatchApp.dispatch` and `DispatchFn` accept `"anything"` with unknown-shaped input and return `Promise<Result<unknown, unknown>>`.
   Expect: no typed in-process dispatch narrowing appears in these assertions.
6. Page: repository shell.
   Inspect: command output.
   Action: run `bun run typecheck`.
   Expect: command exits 0 and reports `tsgo --noEmit -p tsconfig.json` completed successfully.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Operation helpers | `src/__tests__/type-check.ts` / `Operation helper type flow` | `_typedOperations` | command/query name, input, output, error, result assertions present | Compile-only proof |
| Fastify route positives | `src/__tests__/type-check.ts` / `_typedFastifyRoutes` | `typed-command`, `typed-query` | known command and query routes accepted | Compile-only proof |
| Fastify route negatives | `src/__tests__/type-check.ts` / `_missingFastifySliceRoutes`, `_invalidFastifyCommandInputRoutes`, `_invalidFastifyQueryInputRoutes` | invalid names/shapes | `@ts-expect-error` covers invalid config | Compile-only proof |
| Respond typing | `src/__tests__/type-check.ts` / route `respond` callbacks | selected slice result | command result and query result are distinct | Compile-only proof |
| Dynamic dispatch | `src/__tests__/type-check.ts` / `_dynamicDispatchResult`, `_dispatchFnResult` | `"anything"`, unknown input | returns `Promise<Result<unknown, unknown>>` | Boundary preserved |
| CLI check | `bun run typecheck` | repo checkout | exit 0 | Required gate |

## Pass Criteria
- All listed type-check anchors exist with the expected positive and negative examples.
- `bun run typecheck` exits 0.

## Failure Capture
- failing step number
- exact missing or incorrect anchor in `src/__tests__/type-check.ts`
- full `bun run typecheck` command output when applicable
- current git commit or branch
