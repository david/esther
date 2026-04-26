# QA Result — qa-no-public-typed-client

Status: passed
Date: 2026-04-26

## Evidence
- Confirmed `DispatchFn` remains `(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>` in `src/core/input-adapter.ts`.
- Confirmed `InputAdapterBinding.bind` still accepts the dynamic `DispatchFn`.
- Confirmed app dispatch implementation remains `dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>>` in `src/core/app.ts`.
- Confirmed dynamic-dispatch type assertions remain in `src/__tests__/type-check.ts`.
- Search for `app.client`, `createAppClient`, `client.dispatch`, and `app.execute` across `src`, `doc`, `AGENTS.md`, and `CLAUDE.md` found no matches.

## Failure evidence
- None.
