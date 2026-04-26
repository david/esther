# QA Context — qa-no-public-typed-client

## Setup
- Repository: `/home/david/esther-w0`
- Browser/session: none
- External services: none
- Fixture data: none
- Depends on passed tasks: `qa-type-route-contracts`, `qa-fastify-runtime-routes`.

## Preconditions checked
- `git status --porcelain`: clean before QA artifacts were generated.
- `cd be && bun run migrate:data:check`: skipped because this repository has no `be/` directory.

## Commands
- `rg -n "app\.client|createAppClient|client\.dispatch|app\.execute" src doc AGENTS.md CLAUDE.md`
- `rg -n "dispatch\(sliceName: string, input: unknown\)|type DispatchFn|bind: \(dispatch: DispatchFn\)|_dynamicDispatchResult|_dispatchFnResult" src/core/app.ts src/core/input-adapter.ts src/__tests__/type-check.ts`

## Reusable evidence
- Forbidden facade search found no matches.
- Dynamic boundary anchors found in `src/core/input-adapter.ts:3`, `src/core/input-adapter.ts:12`, `src/core/app.ts:185`, `src/__tests__/type-check.ts:818`, and `src/__tests__/type-check.ts:823`.
