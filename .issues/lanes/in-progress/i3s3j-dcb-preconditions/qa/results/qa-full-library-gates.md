# QA result — qa-full-library-gates

Status: passed
Date: 2026-04-25
Mode: agent-executable-non-browser

## Commands run
```bash
bun run typecheck
bun run lint
bun run test
```

## Evidence
- `bun run typecheck`: passed — `tsgo --noEmit -p tsconfig.json` completed with exit status 0.
- `bun run lint`: passed — ESLint completed with `--max-warnings=0`; dependency-cruiser reported `no dependency violations found (49 modules, 129 dependencies cruised)`.
- `bun run test`: passed — Bun summary: `209 pass`, `0 fail`, `507 expect() calls`, `Ran 209 tests across 18 files`.

## Failures
- None.
