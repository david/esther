# No-adapter app API contract spot check

status: pending
role: developer
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify the public no-adapter `createApp()` API contract is represented in type coverage, runtime coverage, and architecture docs.

## Setup Notes
- No external services, browser, database, or seed data required.
- Reuse repository checkout at issue branch HEAD.
- Relevant changed files: `src/core/app.ts`, `src/core/app.test.ts`, `src/__tests__/type-check.ts`, `doc/architecture.md`.
- Global gates already passed in `review/findings/01-gate-results.md`; this QA task is a focused API/documentation spot check because plan says no manual UI QA is required.

## Start
- URL: n/a
- Page: repository working tree at issue branch HEAD

## Steps
1. Page: repository working tree
   Inspect: `src/__tests__/type-check.ts`
   Action: Confirm a no-adapter `AppConfig` example and no-adapter `createApp({ eventStore, slices })` example exist.
   Expect: `AppConfig` accepts `{ eventStore: createInMemoryEventStore(), slices: [] }` without `inputAdapter`, and `createApp({ eventStore: createInMemoryEventStore(), slices: _typedOperations })` is present.
2. Page: repository working tree
   Inspect: `src/core/app.test.ts`
   Action: Confirm focused runtime tests cover direct dispatch without adapter, unknown-slice error without adapter, no-adapter lifecycle, and adapter-present binding/lifecycle delegation.
   Expect: Tests explicitly assert successful `app.dispatch("ping", ...)`, `Unknown slice: missing`, `start()` / `stop()` resolving, `bind` called once, and adapter `start` / `stop` called once.
3. Page: repository working tree
   Inspect: `doc/architecture.md`
   Action: Confirm app wiring and invocation docs describe optional input adapter binding and direct dynamic dispatch without transport.
   Expect: Docs no longer imply one mandatory input adapter binding.
4. Page: terminal
   Inspect: command output
   Action: Run `bun run typecheck`.
   Expect: Command exits 0 and `tsgo --noEmit -p tsconfig.json` completes.
5. Page: terminal
   Inspect: command output
   Action: Run `bun test src/core/app.test.ts`.
   Expect: Command exits 0 and focused app tests pass.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| No-adapter config type | `src/__tests__/type-check.ts` `_directDispatchConfig` | `eventStore`, `slices: []`, no `inputAdapter` | Typecheck accepts config | Public API additive contract |
| No-adapter createApp type | `src/__tests__/type-check.ts` `_directDynamicDispatchApp` | `_typedOperations`, no `inputAdapter` | Typecheck accepts app creation | Direct dispatch first-class |
| No-adapter direct dispatch | `src/core/app.test.ts` `dispatches directly without an input adapter` | `ping` query, `{ message: "pong" }` | Result is ok with `{ message: "pong" }` | Runtime contract |
| Unknown slice behavior | `src/core/app.test.ts` `throws the existing unknown slice error without an input adapter` | slice name `missing` | Throws `Unknown slice: missing` | Error text preserved |
| No-adapter lifecycle | `src/core/app.test.ts` `start and stop resolve without an input adapter` | no input adapter | `start()` and `stop()` resolve `undefined` | No-op lifecycle |
| Adapter-present behavior | `src/core/app.test.ts` `binds adapter dispatch and delegates lifecycle when adapter is present` | custom `InputAdapterBinding` | `bind`, `start`, and `stop` each called once | Regression guard |
| Architecture docs | `doc/architecture.md` app wiring / invocation model | optional transport binding | Docs mention optional input adapter and direct `app.dispatch` without transport | User-facing docs |

## Pass Criteria
- All five steps match expected results.
- `bun run typecheck` passes.
- `bun test src/core/app.test.ts` passes.
- No browser or external manual QA is needed for this library/API-only change.

## Failure Capture
- failing step number
- exact file, test name, or command under test
- expected result
- actual result
- terminal output for failed command
- note whether failure is product behavior, QA setup, or ambiguous instructions
