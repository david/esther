# qa-reducer-type-contract context

status: ready
repository_root: /home/david/esther-w0
browser_session: none
mode: agent-executable-non-browser

## Setup

No CLI fixture setup required. Library type-contract QA uses existing source tests only.

## Preflight

- `git status --porcelain`: clean before QA artifact generation.
- `cd be && bun run migrate:data:check`: not applicable in this repo; `be/` directory absent and `package.json` defines no migration script.
