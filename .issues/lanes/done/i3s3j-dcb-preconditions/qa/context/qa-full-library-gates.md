# QA context — qa-full-library-gates

Date: 2026-04-25
Mode: agent-executable-non-browser
Setup result: ready

## Preconditions
- Depends on `qa-focused-dcb-preconditions`: passed.
- Browser/session setup: none.
- Data migration check: not applicable; repo has no `be/` directory.

## Commands
```bash
bun run typecheck
bun run lint
bun run test
```
