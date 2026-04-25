# QA Result — qa-focused-adapter-conformance

Status: passed
Date: 2026-04-25
Mode: agent-executable-non-browser

## Command

```bash
bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts
```

## Evidence
- Command exited 0.
- `45 pass`, `0 fail`, `111 expect() calls`.
- Ran 45 tests across 3 files.
- Output included append conformance suites for:
  - `in-memory EventStore.append precondition conformance`
  - `filesystem EventStore.append precondition conformance`
  - `postgres EventStore.append precondition conformance`
- Output included the six shared conformance cases for each adapter:
  - omitted options do not activate a precondition
  - present options protect an empty tagged boundary
  - `boundaryTags undefined` protects an empty global stream
  - `boundaryTags undefined` and empty arrays both select the global stream
  - stale tagged boundary returns `ConcurrencyError` and does not append
  - stale global boundary returns `ConcurrencyError` and does not append

## Failure evidence
None.
