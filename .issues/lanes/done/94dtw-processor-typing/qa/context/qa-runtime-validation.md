# QA context — qa-runtime-validation

Date: 2026-04-27
Issue: `.issues/lanes/in-progress/94dtw-processor-typing`
Mode: agent-executable-non-browser

## Global preflight

```bash
git status --porcelain
```

Result: clean worktree before running this QA task.

```bash
cd be && bun run migrate:data:check
```

Result: not applicable in this repo checkout; no `be/` directory and `doc/commands.md` defines no migration check.

## Prerequisites

- `qa-typecheck-inference`: dependency status passed.
- `qa-runtime-validation`: concrete task exists; no browser/service/database setup required.
- Bun test fixtures are repository-local and require no extra setup.
