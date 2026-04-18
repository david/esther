# Testing

## Read this doc when

- you are adding coverage for new behavior or a regression
- you need to know where tests should live
- you are changing framework types or public DSL behavior

## Test layout

The repo uses a mix of colocated tests and cross-module integration tests:

- `src/__tests__/`
  - higher-level pipeline and wiring tests
  - compile-only API/type tests in `type-check.ts`
- `src/**/` `*.test.ts` / `*.test.tsx`
  - unit or adapter-focused tests kept near the code they exercise

## Choose the right test location

Use `src/__tests__/` when the behavior spans multiple modules, for example:
- command/query pipeline behavior
- app wiring through `createApp`
- public API type-flow guarantees

Use colocated adapter/core tests when the behavior belongs to one module or subsystem, for example:
- postgres query/projection behavior
- filesystem event-store persistence rules
- react adapter subscription behavior

## Important repo-specific expectations

- `src/__tests__/type-check.ts` is not a runtime test. It exists to fail typechecking when the public DSL loses important inference or safety guarantees.
- When changing types or fluent DSL behavior, expect to update or extend type-check coverage.
- When fixing a bug, add a regression test close to the failing behavior.
- Do not narrow verification to changed files only; the whole repo must stay green.

## Test style

- Prefer real framework primitives over mocks when practical.
- Keep tests explicit about event shapes, schemas, and expected `Result` behavior.
- For adapter boundaries, verify the behavior that matters at the boundary: persistence shape, parsing, error mapping, query semantics, or subscription semantics.
- Avoid weakened assertions, skipped tests, and `.only`.

## Standard commands

```bash
bun run test
bun run typecheck
bun run lint
```

Use targeted test commands while iterating if helpful, but finish with the full suite and full quality gates.
