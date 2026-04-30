# qa-public-command-runtime Context

## Fixture
- Repository checkout: `.issues/lanes/in-progress/11w2y-public-command-descriptors` implementation branch.
- Dependencies: use `bun install --frozen-lockfile` if `node_modules` missing or stale.

## Commands
- `bun run test`

## Evidence to collect
- exit code
- Bun test summary
- failing test names and stack traces, if any
- current git commit hash

## Notes
- No browser workflow needed.
- Runtime invariant coverage is deterministic library test coverage, not manual QA.
