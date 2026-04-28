# QA Summary — bs43i-tighten-query-where

## Planned tasks
| QA key | Mode | Purpose | Status |
| --- | --- | --- | --- |
| qa-where-type-grammar | auto-cli | Typecheck compile-only public `where` grammar assertions | pending |
| qa-where-runtime-fail-fast | auto-cli | Focused runtime fail-fast validation for descriptor and named query surfaces | pending |
| qa-full-gates-and-docs | needs-cli-domain | Full gates plus automated `llms.txt` grammar assertion | pending |

## Mode counts
- auto-cli: 2
- auto-browser: 0
- manual: 0
- needs-workflow: 0
- needs-cli-domain: 1

## Workflow-learning needs
- none — repo has no browser/UI QA workflow for this TypeScript library DSL change.

## Missing CLI domains/actions
- docs: documented command to assert `llms.txt` read-model `where` grammar includes string/number/boolean equality, string/number range, string/number/boolean `in`, and object/array fields as non-queryable.

## Requested CLI addition
- Add smallest documented docs-check command for public contract snippets in `llms.txt`, or document existing command if one already owns this check.

## HTML discoverability improvements
- none — no HTML/browser surface changed.

## Notes
- `doc/qa.md`, `doc/qa-users.md`, and QA workflow docs are absent in this repo; planning used `doc/testing.md`, `doc/commands.md`, `doc/workflow.md`, and issue artifacts.
- Full gates already passed in `review/findings/01-gate-results.md`; QA tasks are planned for durable rerun/recording, not executed here.
