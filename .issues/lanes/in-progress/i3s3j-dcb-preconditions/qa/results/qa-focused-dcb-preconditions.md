# QA result — qa-focused-dcb-preconditions

Status: passed
Date: 2026-04-25
Mode: agent-executable-non-browser

## Command run
```bash
bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts src/__tests__/pipeline-wiring.test.ts
```

## Evidence
- Exit status: 0
- Bun summary: `60 pass`, `0 fail`, `176 expect() calls`, `Ran 60 tests across 4 files`.
- Adapter coverage passed for:
  - in-memory present `AppendOptions` and empty/global boundary semantics
  - filesystem present `AppendOptions` and empty/global boundary semantics
  - postgres present `AppendOptions`, global boundary semantics, and transaction-scoped advisory lock ordering
- Command-pipeline coverage passed for:
  - stale non-empty `tagQuery(...)` boundary
  - stale empty `tagQuery(...)` boundary
  - stale `castTagQuery(...)` boundary with skipped command side effects
  - multi-observation fail-fast before downstream work
  - `lookup(...)`, `derive(...)`, and `generate(...)` appending without observation-derived preconditions
  - query-side `tagQuery(...)` remaining read-only

## Failures
- None.
