# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- index.md
- research/01-current-state.md
- plan/01-implementation-plan.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/domain-language.md
- doc/testing.md
- doc/commands.md
- package.json
- src/index.ts
- src/adapters/cli/index.ts
- src/adapters/fastify/index.ts
- src/adapters/filesystem/index.ts
- src/adapters/in-memory/index.ts
- src/adapters/postgres/index.ts
- src/adapters/react/index.ts
- llms.txt targeted package/export sections
- references: event-contract-validation, auth-access-analysis, automation-readmodel-replay-analysis, invariants-observability-analysis

## Alignment with user request

Plan matches request: update `llms.txt` so current public API, DSL behavior, adapter usage, errors, and examples match repo state. It keeps scope docs-only and targets highest-risk drift found by research: root/subpath export precision, `operations` vocabulary, dynamic dispatch wording, adapter helper exports, error behavior, and stale slice wording.

## Scope drift
- missing requested scope: none blocking
- unapproved added scope: none; full repo gates and manual docs QA are normal repo requirement, not product scope expansion

## Contract coverage
- behavior/workflow: covered. Plan preserves docs-only runtime behavior and current `operations`/dynamic dispatch model.
- events/replay: covered. Plan explicitly says no event model, replay, migration, or deploy-order change; keeps `defineEvent` and low-level `EventRecordInput` distinction.
- request/response/shared types/callers: covered. Plan focuses root/subpath exported type inventory and typed adapter config vs dynamic `app.dispatch` boundary.
- persistence/migrations/read models: covered. Plan names read-model descriptor/export precision and no persistence/migration/replay change.
- auth/security/visibility: covered. Plan preserves host-owned auth and avoids implying new role/session/token model.
- side effects/automations: covered. Plan preserves processors returning effect descriptors and adapters doing I/O.
- invariants/observability: covered enough for docs-only work. Export/docs correctness, canonical DSL examples, dynamic dispatch boundary, and low-level helper labeling are explicit invariants.
- rollout/deploy order: covered. Docs-only normal review path, no migration/version/deploy sequencing.
- tests/QA: covered. Focused stale/current API searches, source export cross-check, manual docs QA, and full `bun run typecheck`, `bun run lint`, `bun run test` are required.

## Failure modes checked
- LLMs copy import for public symbol omitted from `llms.txt`.
- LLMs infer removed `AppConfig.slices`, `defineSlice(...)`, or stale Fastify helper.
- `esther/test` looks like it exports projection adapter when it does not.
- Low-level Postgres helpers look like canonical app DSL.
- Dynamic dispatch docs imply typed in-process app client instead of adapter-bound typing.
- Docs-only change skips full repo gates.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items
- During export inventory pass, do not stop at research omission list. Cross-check full `src/index.ts` export names. Current missing-from-`llms.txt` examples include command/descriptor helper types not listed in plan detail: `CastTagQueryDescriptor`, `CommandLookupDescriptor`, `CommandLookupByArgsDescriptor`, `CommandLookupByIdDescriptor`, `CommandDefinition`, `DeriveStep`, `GenerateStep`, `OutputErrHandlers`, `ProjectionStep`, `QueryProjectionStep`, `TagQueryStep`, and `ValidatePredicate`. Either list them in compact grouped inventory or intentionally scope them out.
- Also include or intentionally scope `InMemoryInputAdapter`; root and `esther/test` export it.
- Preserve `projectionAdapters` / `projectionQuery` only as deprecated compatibility prose, not primary config examples.
- Keep `slice` wording only where exact API compatibility requires it: `sliceName`, Fastify route `slice`, `SliceError`, and unknown-slice error wording.
- Keep low-level helpers (`EventRecordInput`, Postgres constraint helpers, dispatch aliases) documented as interop/adapter helpers, not preferred app authoring path.
- Record focused search results and full gate results in implementation checkpoint.

## Next handoff

Use {{/skill:breakdown iclpa-update-llms --from plan/01-implementation-plan.md}}.
