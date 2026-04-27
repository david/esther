# QA context — qa-typecheck-inference

Date: 2026-04-27
Issue: `.issues/lanes/in-progress/94dtw-processor-typing`
Mode: agent-executable-non-browser

## Global preflight

Commands run before QA task generation:

```bash
git status --porcelain
```

Result: clean worktree before QA artifacts were written.

```bash
cd be && bun run migrate:data:check
```

Result: not applicable in this repo checkout; command failed because `/home/david/esther-w0/be` does not exist. Project `package.json` has no `migrate:data:check` script and `doc/commands.md` defines no migration check.

## Prerequisite sweep

- `qa-typecheck-inference`: concrete task exists; no dependencies; no browser/service/database setup required.
- `qa-runtime-validation`: concrete task exists; depends on `qa-typecheck-inference`; no browser/service/database setup required.
- `qa-public-notes`: concrete task exists; depends on `qa-runtime-validation`; no browser/service/database setup required.

No CLI setup gaps for library-only QA tasks.
