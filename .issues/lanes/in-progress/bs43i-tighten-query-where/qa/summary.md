# QA Summary — bs43i-tighten-query-where

## Latest auto-qa run
- run_at: 2026-04-28T22:41:56+00:00
- verdict: blocked before execution
- reason: requested task set includes `qa-full-gates-and-docs`, which has missing CLI domain/action for automated `llms.txt` docs assertion

## Task results
| QA key | Mode | Purpose | Status |
| --- | --- | --- | --- |
| qa-where-type-grammar | auto-cli | Typecheck compile-only public `where` grammar assertions | pending; not run because requested-set gate blocked |
| qa-where-runtime-fail-fast | auto-cli | Focused runtime fail-fast validation for descriptor and named query surfaces | pending; not run because requested-set gate blocked |
| qa-full-gates-and-docs | needs-cli-domain | Full gates plus automated `llms.txt` grammar assertion | blocked |

## Counts
- passed: 0
- failed: 0
- blocked: 1
- skipped/manual remaining: 2

## Tasks run
- none; auto-qa refused whole requested set before setup/test execution per CLI-domain gate.

## Preflight evidence
- `git status --porcelain`: clean
- data migration preflight: not applicable; repository has no `be/` directory

## Workflow-learning needs
- none — repo has no browser/UI QA workflow for this TypeScript library DSL change.

## Missing CLI domains/actions
- docs: documented command to assert `llms.txt` read-model `where` grammar includes string/number/boolean equality, string/number range, string/number/boolean `in`, and object/array fields as non-queryable.

## Requested CLI addition
- Add smallest documented docs-check command for public contract snippets in `llms.txt`, or document existing command if one already owns this check.

## HTML discoverability improvements
- none — no HTML/browser surface changed.

## Notes
- `doc/qa.md`, `doc/qa-users.md`, and QA workflow docs are absent in this repo.
- `doc/commands.md` documents full gates but no docs assertion command.
- Previous gate evidence exists in `review/findings/01-gate-results.md`, but auto-qa did not rerun gates because requested set has unresolved CLI-domain blocker.

## Next command
- {{/skill:plan-qa bs43i-tighten-query-where --repair qa-full-gates-and-docs}}
