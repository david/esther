# QA result — No-adapter app API contract spot check

Date: 2026-04-27
Status: passed
Mode: agent-executable-non-browser

## Steps executed

1. Inspected `src/__tests__/type-check.ts` for no-adapter public type coverage.
   - Found `_directDispatchConfig` at line 546.
   - Found `_directDynamicDispatchApp` at line 1178.
   - Expected result met: no-adapter `AppConfig` and `createApp()` examples exist.

2. Inspected `src/core/app.test.ts` for runtime behavior coverage.
   - Found `dispatches directly without an input adapter` at line 18.
   - Found `Unknown slice: missing` assertion at line 39.
   - Found `start and stop resolve without an input adapter` at line 43.
   - Found `binds adapter dispatch and delegates lifecycle when adapter is present` at line 53.
   - Expected result met: no-adapter and adapter-present paths covered.

3. Inspected `doc/architecture.md` for app wiring docs.
   - Found `optional input adapter binding for transport/runtime invocation` at line 50.
   - Found direct `app.dispatch(sliceName, input)` without transport language at line 64.
   - Expected result met: docs no longer imply mandatory input adapter.

4. Ran typecheck.

```bash
bun run typecheck
```

Output:

```text
$ tsgo --noEmit -p tsconfig.json
```

Result: pass.

5. Ran focused app test.

```bash
bun test src/core/app.test.ts
```

Output:

```text
bun test v1.3.12 (700fc117)

src/core/app.test.ts:
(pass) createApp > dispatches directly without an input adapter [5.00ms]
(pass) createApp > throws the existing unknown slice error without an input adapter
(pass) createApp > start and stop resolve without an input adapter
(pass) createApp > binds adapter dispatch and delegates lifecycle when adapter is present [1.00ms]

 4 pass
 0 fail
 11 expect() calls
Ran 4 tests across 1 file. [271.00ms]
```

Result: pass.

## Pass criteria
- All file-inspection steps matched expected anchors.
- `bun run typecheck` passed.
- `bun test src/core/app.test.ts` passed.
- No browser or external manual QA needed for this library/API-only change.

## Failures
None.
