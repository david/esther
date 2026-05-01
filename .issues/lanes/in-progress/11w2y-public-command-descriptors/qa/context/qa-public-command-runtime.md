# qa-public-command-runtime Context

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
- `bun run test`

## Evidence to collect
- exit code
- Bun test summary
- any failing test file/name/stack trace
- current git commit hash

## Notes
- No browser workflow needed.
- Runtime checks are deterministic library tests covering command descriptor helpers, event validation, raw command path, and `outputErr` handler merge routing.
- Planned from `doc/commands.md`, impl checkpoints 03, 06, 09, and `review/diff/04-review-diff.md`.
