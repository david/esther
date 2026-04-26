# QA Result — qa-type-route-contracts

Status: passed
Date: 2026-04-26

## Evidence
- Confirmed operation helper type-flow section exists in `src/__tests__/type-check.ts`.
- Confirmed typed Fastify route binding examples exist for `typed-command` and `typed-query`.
- Confirmed negative `@ts-expect-error` coverage exists for unknown Fastify slice names and mismatched command/query input mapper returns.
- Confirmed `respond` callback typing distinguishes command and query `Result` types.
- Confirmed dynamic dispatch assertions remain: `_dynamicDispatchResult` and `_dispatchFnResult` are `Promise<Result<unknown, unknown>>`.
- `bun run typecheck`: passed (`tsgo --noEmit -p tsconfig.json`).

## Failure evidence
- None.
