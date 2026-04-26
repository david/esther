# No public typed in-process client facade

status: pending
role: agent
browser_session: none
depends_on:
  - qa-type-route-contracts
  - qa-fastify-runtime-routes
mode: agent-executable-non-browser

## Goal
Confirm the feature stayed at the adapter configuration boundary and did not add a public `app.client`, `app.execute`, or typed in-process dispatch facade.

## Setup Notes
- Repository checkout: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/hgqcm-typed-adapter-bindings`.
- No browser, database, service, or fixture data required.
- This check reuses source and test evidence from the completed type and Fastify runtime QA tasks.
- Use shell inspection only; do not edit source code.

## Start
- URL: n/a
- Page: repository shell at `/home/david/esther-w0`

## Steps
1. Page: repository shell.
   Inspect: `src/core/app.ts` exported `App` contract.
   Action: confirm the public app object exposes `dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>>` and does not expose `client`, typed `dispatch`, or `execute` methods.
   Expect: `App.dispatch` remains dynamic string/unknown and no in-process client facade is present.
2. Page: repository shell.
   Inspect: `src/core/input-adapter.ts` exported `DispatchFn` and `InputAdapterBinding` contracts.
   Action: confirm `DispatchFn` remains `(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>` and `InputAdapterBinding.bind` accepts that dynamic dispatch function.
   Expect: adapter-to-core boundary remains dynamic.
3. Page: repository shell.
   Inspect: `src/index.ts` public root exports.
   Action: confirm root exports include operation helper types but do not export `app.client`, `createAppClient`, typed in-process client APIs, or an `execute` app facade.
   Expect: public root API remains adapter-bound; Fastify helper exports are under `src/adapters/fastify/index.ts`.
4. Page: repository shell.
   Inspect: repository search output.
   Action: run `rg -n "app\.client|createAppClient|typed app client|client\.dispatch|app\.execute" src doc AGENTS.md CLAUDE.md`.
   Expect: no public API implementation or docs endorse a new typed in-process client facade; only negative/superseded wording is acceptable if present.
5. Page: repository shell.
   Inspect: dynamic-dispatch assertions in `src/__tests__/type-check.ts`.
   Action: confirm `_dynamicDispatchResult` and `_dispatchFnResult` still assert `Promise<Result<unknown, unknown>>` for arbitrary string slice names.
   Expect: tests protect the dynamic app/input-adapter boundary.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| App boundary | `src/core/app.ts` / `App` | public app object | dynamic `dispatch(string, unknown)` only | No client facade |
| Adapter boundary | `src/core/input-adapter.ts` / `DispatchFn` | adapter binding | dynamic `string` + `unknown` | Boundary preserved |
| Root exports | `src/index.ts` | package root | no typed in-process app client export | Public API check |
| Repo search | `rg` command | `src doc AGENTS.md CLAUDE.md` | no positive `app.client`/`app.execute` API | Superseded docs OK if negative |
| Type assertions | `src/__tests__/type-check.ts` / dynamic dispatch bottom section | arbitrary `"anything"` slice | `Promise<Result<unknown, unknown>>` | Regression proof |

## Pass Criteria
- `App`, `DispatchFn`, and `InputAdapterBinding` remain dynamic.
- No public `app.client`, `createAppClient`, `client.dispatch`, `app.execute`, or equivalent typed in-process dispatch facade was added.
- Dynamic dispatch type assertions remain present.

## Failure Capture
- failing step number
- exact file and line where a public typed in-process client facade appears or where dynamic dispatch changed
- `rg` command output
- current git commit or branch
