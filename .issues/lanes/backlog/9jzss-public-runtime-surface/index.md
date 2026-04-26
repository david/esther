# 9jzss-public-runtime-surface — workflow index

## Issue

Narrow Esther's public runtime surface so low-level pipeline/runtime internals do not become accidental stable API.

## Latest research

- [research/01-current-state.md](research/01-current-state.md) — root package entrypoint is `src/index.ts`; it currently exports stable DSL symbols plus runtime internals like pipeline executors, read interpreter, compile deps, projection store, and descriptor implementation types.
- [research/02-caller-inventory.md](research/02-caller-inventory.md) — only tests/type fixtures import root exports in-repo; no root caller depends on `executeCommand`, `executeQuery`, `createReadInterpreter`, or `ReadInterpreterDeps`.
- [research/03-public-export-audit.md](research/03-public-export-audit.md) — classified exports into stable public DSL, extension contracts, deprecated compatibility surface, and unstable internal candidates.

## Current recommended handoff

Use `{{/skill:plan 9jzss-public-runtime-surface}}` to decide the target export policy: keep stable DSL/API, document extension contracts, handle deprecated projection compatibility, and hide or mark unstable runtime internals.
