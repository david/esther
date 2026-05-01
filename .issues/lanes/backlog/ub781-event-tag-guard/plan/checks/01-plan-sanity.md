# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- research/01-feature-spec.md
- plan/01-implementation-plan.md
- index.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/domain-language.md
- doc/testing.md
- doc/commands.md
- doc/dcb.md
- llms.txt
- src/core/pipeline.ts
- src/core/types.ts
- src/index.ts
- src/adapters/fastify/input.ts
- references: event-contract-validation, automation-readmodel-replay-analysis, invariants-observability-analysis, behavior-concentration

## Alignment with user request
Plan matches approved feature spec: strict core runtime guard with no opt-out. Rule is `observedBoundary.tags ⊆ emittedEvent.tags`; missing tags return `EventTagMismatchError` before append.

## Scope drift
- missing requested scope: none found
- unapproved added scope: none found. Fastify explicit mapping is correctly non-required unless implementation changes default behavior.

## Contract coverage
- behavior/workflow: covered. Plan names execution order and failure point after event schema validation, before append.
- events/replay: covered. User event wire shape unchanged; historical events not revalidated; no replay/backfill.
- request/response/shared types/callers: covered. `EventTagMismatchError` shape, `SliceError`, main exports, `OperationError` implications, and default Fastify 422 are explicit.
- persistence/migrations/read models: covered. Event-store append options/record shape unchanged; no migrations; no read-model schema change.
- auth/security/visibility: covered enough. Plan says not auth, and warns default HTTP body may expose tags unless custom `respond` redacts.
- side effects/automations: covered. Mismatch before append means no `onAfterInsert`, `onAfterCommit`, projector, processor, or effect fanout.
- invariants/observability: covered. Main invariant and structured diagnostic error are explicit; no logs/metrics needed.
- rollout/deploy order: covered. Normal deploy, release note/docs callout for stricter behavior.
- tests/QA: covered. Focused pipeline/type/doc tests plus full `bun run typecheck`, `bun run lint`, `bun run test`.

## Failure modes checked
- Guard masks malformed definition-backed event: plan prevents by requiring schema parse before tag guard.
- Guard blocks valid extra tags: plan allows extra event tags.
- Guard changes adapter semantics: plan keeps policy in core and event-store append options unchanged.
- Mismatch still appends/fans out: plan requires no append and no projector/processor/effect fanout tests.
- `castTagQuery(...)` bypasses guard: plan requires same guard.
- Empty/global boundary overconstrains tags: plan says empty observed tags impose no emitted tag requirement.
- Public API/type export forgotten: plan requires type-check import and `SliceError` coverage.
- Docs drift: plan requires `doc/dcb.md`, `doc/domain-language.md`, and `llms.txt` updates.

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Keep `EventTagMismatchError` as framework error bypassing `outputErr`; update `isFrameworkInputError(...)` only if implementation introduces any path where descriptors can return it.
- Preserve missing tag order from observed tags; use set membership so event tag order and extra tags do not matter.
- Verify no append by querying store or append counter, not only by result error.
- Verify no fanout across read-model binding/projector and processor/effect paths; current hook names are `onAfterInsert` and `onAfterCommit`.
- Update command execution order docs in both code comments and `llms.txt` so guard appears between event schema validation and append.
- Keep core free of adapter imports; do not duplicate guard in event-store adapters.

## Next handoff
{{/skill:breakdown ub781-event-tag-guard --from plan/01-implementation-plan.md}}
