# qa-public-command-lint Context

status: planned
supersedes: prior context from commit `c054514d12aeebfc6fa1f63ec7b230c4c7dd2b49`

## Fixture
- Repository checkout: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/11w2y-public-command-descriptors`.
- Dependencies: QA runner should use existing `node_modules` if present; otherwise run `bun install --frozen-lockfile`.
- Git commit: record current commit during QA execution.

## Preflight
- `git status --porcelain`: QA runner should record clean/dirty state before command execution.
- Data migration check: not applicable; repo docs define no data migration QA command and issue plans state no persistence/migration change.

## Commands planned
- `bun run lint`

## Evidence to collect
- exit code
- ESLint output
- dependency-cruiser output
- current git commit hash

## Notes
- No browser workflow needed.
- `bun run lint` covers ESLint and dependency-cruiser per `doc/commands.md`.
- Planned from `doc/commands.md`, impl checkpoints 04 and 07, and `review/diff/04-review-diff.md`.
