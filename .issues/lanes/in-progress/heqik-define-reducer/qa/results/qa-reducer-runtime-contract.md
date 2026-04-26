# qa-reducer-runtime-contract results

status: passed
date: 2026-04-26

## Command

```bash
bun test src/core/reducer.test.ts src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts src/__tests__/event-store-append-conformance.ts src/__tests__/pipeline.test.ts src/__tests__/pipeline-wiring.test.ts src/core/slice.test.ts src/core/read-interpreter.test.ts src/core/read-model.test.ts
```

## Evidence

- Focused runtime reducer contract tests passed.
- Bun reported `160 pass`, `0 fail`, `388 expect() calls`, across 9 files.
- Covered reducer fold, event-store adapter parse/fold, tag intersection, max position, command/query `tagQuery`, `castTagQuery`, subject binding, stale-boundary preconditions, and read descriptor forwarding.

## Pass criteria

- Focused Bun test command exited 0 with all listed runtime reducer behavior tests passing.
