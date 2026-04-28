# qa-full-gates-and-docs status

status: passed
mode: auto-cli
last_run: 2026-04-28T22:47:30Z
result: passed
blocked_by: none

## Evidence
- Dependency `qa-where-runtime-fail-fast` passed.
- `bun run test` exited 0: 272 pass, 0 fail, 659 expect() calls.
- `bun run lint` exited 0: ESLint and dependency-cruiser passed.
- `bun run typecheck` exited 0: `tsgo --noEmit -p tsconfig.json` passed.
- `llms.txt` lines 301-317 document primitive-only read-model `where` grammar and object/array non-queryability.
