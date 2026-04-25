# QA Result — qa-full-repo-gates

Status: passed
Date: 2026-04-25
Mode: agent-executable-non-browser
Depends on: `qa-focused-adapter-conformance`

## Commands

```bash
bun run typecheck
bun run lint
bun run test
```

## Evidence
- `bun run typecheck`: passed — `tsgo --noEmit -p tsconfig.json` completed.
- `bun run lint`: passed — ESLint completed with `--max-warnings=0`; dependency-cruiser reported no dependency violations across 50 modules and 134 dependencies.
- `bun run test`: passed — `215 pass`, `0 fail`, `533 expect() calls`; ran 215 tests across 18 files.
- Full test output included append conformance tests for in-memory, filesystem, and postgres adapters.

## Failure evidence
None.
