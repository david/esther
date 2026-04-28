# Review Diff Digest — compose/query API distinction

Source: commit `5222e82` (`docs(dsl): document command query API split`)
Date: 2026-04-28

## Executive Summary

- Change set is mostly semantic documentation, plus workflow lane move from backlog to in-progress.
- Public docs now state command `compose().add(...)` and query `state().pipe(...)` are intentionally separate current concepts.
- No runtime, TypeScript signature, event, persistence, auth, adapter, read-model, or processor files changed.
- Highest-risk area is public guidance accuracy; reviewed text stays scoped to current API decision and does not introduce aliases.

## High-Risk Changes

None found.

## Boundary Contract Changes

### Public documentation contract

- `doc/domain-language.md` adds rationale for separate command input pipeline vs query state resolver APIs.
- `llms.txt` adds LLM guidance to keep command examples on `compose().add(...)` and query examples on `state().pipe(...)`.
- Boundary-facing impact: documentation/LLM guidance only; no exported runtime types or public API signatures changed.
- Risk: Low.
- Confidence: High — commit only changes docs/workflow artifacts, with no `src/`, adapter, test, or package runtime files.

## Event Model Changes

None.

## Persistence Changes

None.

## Authorization Changes

None.

## Workflow / State Changes

- Issue artifacts moved from `.issues/lanes/backlog/vah3v-compose-query-api` to `.issues/lanes/in-progress/vah3v-compose-query-api`.
- Implementation checkpoint records aligned docs-only implementation and full gate commands passing.

## Side-Effect Changes

None.

## Test Coverage Delta

- No tests added or removed.
- Docs-only change; checkpoint records `bun run typecheck`, `bun run lint`, and `bun run test` passing.
- No skipped or `.only` tests observed in diff.

## Scattered Logic Signals

None found. Change centralizes rationale in `doc/domain-language.md` and mirrors concise LLM guidance in `llms.txt`.

## Missing Counterparts

- No obvious gap found for docs counterpart: `doc/domain-language.md` and `llms.txt` both updated.
- No runtime counterpart expected: plan explicitly scoped this as docs-only and diff matches that scope.
- No migration/replay/auth counterpart expected.

## Review Evidence

- `git show --stat --name-status 5222e82` inspected.
- Commit diff inspected for `doc/domain-language.md`, `llms.txt`, issue index, and implementation checkpoint.
- `git diff-tree --no-commit-id --name-only -r 5222e82 | grep -E '^(src|packages|adapters|examples|test|tests)/' || true`: no runtime/test paths.
- `rg "compose\(\)\.pipe|state\(\)\.add|shared public builder|generic shared public builder" doc llms.txt src -n || true`: no forbidden alias wording.
- `rg "compose\(\)\.add|state\(\)\.pipe|Why command and query pipeline APIs differ|Why API names differ" doc/domain-language.md llms.txt -n`: expected rationale found.

## Next Handoff

`{{/skill:gates vah3v}}`
