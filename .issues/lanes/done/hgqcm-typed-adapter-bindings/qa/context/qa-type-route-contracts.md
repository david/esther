# QA Context — qa-type-route-contracts

## Setup
- Repository: `/home/david/esther-w0`
- Browser/session: none
- External services: none
- Fixture data: none

## Preconditions checked
- `git status --porcelain`: clean before QA artifacts were generated.
- `cd be && bun run migrate:data:check`: skipped because this repository has no `be/` directory.

## Commands
- `rg -n "Operation helper type flow|Typed Fastify route bindings|defineFastifyRoutes<typeof _typedOperations>|missing-slice|_invalidFastifyCommandInputRoutes|_invalidFastifyQueryInputRoutes|_dynamicDispatchResult|_dispatchFnResult" src/__tests__/type-check.ts`
- `bun run typecheck`

## Reusable evidence
- Type-check anchors found at `src/__tests__/type-check.ts:581`, `697`, `703`, `755`, `760`, `765`, `775`, `818`, and `823`.
- `bun run typecheck` exited 0 and ran `tsgo --noEmit -p tsconfig.json`.
