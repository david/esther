# qa-public-command-runtime Context

## Fixture
- Repository checkout: `/home/david/esther-w0`
- Issue: `.issues/lanes/in-progress/11w2y-public-command-descriptors`
- Dependencies: `node_modules` present; no install needed.
- Git commit: `c054514d12aeebfc6fa1f63ec7b230c4c7dd2b49`

## Preflight
- `git status --porcelain`: clean before QA artifact writes.
- `cd be && bun run migrate:data:check`: not applicable; repo has no `be/` directory and project docs define no data migration check.

## Commands
- `bun run test`

## Evidence collected
- exit code: 0
- Bun summary: `281 pass`, `0 fail`, `698 expect() calls`, `Ran 281 tests across 21 files.`
- Runtime invariant coverage observed in `src/__tests__/pipeline-wiring.test.ts`:
  - `commandDefinition returns the same descriptor identity`
  - `commandDefinitionWrapper can add metadata without changing command runtime`
  - `event-definition-backed transform command rejects malformed candidate before downstream work`
  - `raw command event path remains unvalidated by event definitions`

## Notes
- No browser workflow needed.
- Runtime invariant coverage is deterministic library test coverage, not manual QA.
