# qa-public-api-contract Context

## Issue facts
- Issue: `k5vbl-rename-slices`
- Corrected source of truth: no deprecated `slices` alias; `AppConfig.operations` only.
- Dynamic dispatch/adapters remain unchanged: `dispatch(sliceName, input)`, CLI `sliceName`, Fastify `route.slice`, and `Unknown slice: ...` are not renamed in this issue.

## Source artifacts
- `description.md`
- `index.md`
- `review/diff/01-review-diff.md`
- `review/findings/01-gate-results.md`
- `doc/commands.md`
- `doc/testing.md`

## Required commands
- `bun run typecheck`
- `bun run test`
- `bun run lint`

## Not required
- Browser session
- Server startup
- Database setup
- Raw SQL or ad hoc scripts
