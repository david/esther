# qa-public-command-lint Context

## Fixture
- Repository checkout: `/home/david/esther-w0`
- Issue: `.issues/lanes/in-progress/11w2y-public-command-descriptors`
- Dependencies: `node_modules` present; no install needed.
- Git commit: `c054514d12aeebfc6fa1f63ec7b230c4c7dd2b49`

## Preflight
- `git status --porcelain`: clean before QA artifact writes.
- `cd be && bun run migrate:data:check`: not applicable; repo has no `be/` directory and project docs define no data migration check.

## Commands
- `bun run lint`

## Evidence collected
- exit code: 0
- ESLint command: `eslint src --max-warnings=0`
- dependency-cruiser command: `depcruise src --config .dependency-cruiser.cjs --output-type err`
- dependency-cruiser summary: `✔ no dependency violations found (57 modules, 175 dependencies cruised)`

## Notes
- No browser workflow needed.
- This covers lint and dependency-boundary rules from `doc/commands.md`.
