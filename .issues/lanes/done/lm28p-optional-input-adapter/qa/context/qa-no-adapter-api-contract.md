# QA context — qa-no-adapter-api-contract

Date: 2026-04-27

## Environment
- Repository: `/home/david/esther-w0`
- Issue: `.issues/lanes/in-progress/lm28p-optional-input-adapter`
- Mode: agent-executable-non-browser
- Browser/session: none

## Global preflight

```bash
git status --porcelain
```

Output before QA artifact writes: clean.

```bash
cd be && bun run migrate:data:check
```

Output: skipped because this repository has no `be/` directory; no project data migration check exists for this repo layout.

## QA setup
- No CLI fixture setup required.
- No external service required.
- No browser required.
