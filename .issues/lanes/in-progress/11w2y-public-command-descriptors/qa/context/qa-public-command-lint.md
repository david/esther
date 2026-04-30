# qa-public-command-lint Context

## Fixture
- Repository checkout: `.issues/lanes/in-progress/11w2y-public-command-descriptors` implementation branch.
- Dependencies: use `bun install --frozen-lockfile` if `node_modules` missing or stale.

## Commands
- `bun run lint`

## Evidence to collect
- exit code
- ESLint output
- dependency-cruiser output
- current git commit hash

## Notes
- No browser workflow needed.
- This covers lint and dependency-boundary rules from `doc/commands.md`.
