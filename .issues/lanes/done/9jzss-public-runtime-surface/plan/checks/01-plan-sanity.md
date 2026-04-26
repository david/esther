# Plan Check — plan/01-implementation-plan.md

## Verdict

- approved

## Source checked

- description.md
- index.md
- plan/01-implementation-plan.md
- research/01-current-state.md
- research/02-caller-inventory.md
- research/03-public-export-audit.md
- ../../../references/proposed-improvements.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/domain-language.md
- ~/.pi/agent/references/event-contract-validation.md
- ~/.pi/agent/references/invariants-observability-analysis.md
- source spot-checks: package.json, src/index.ts, src/core/compose.ts, src/core/slice.ts, src/core/app.ts, src/core/pipeline.ts, src/core/read-interpreter.ts, src/core/processor.ts, src/core/read-model.ts, src/__tests__/type-check.ts

## Alignment with user request

The plan directly addresses the request to review `src/index.ts` public exports and hide or mark unstable runtime internals before external users depend on them. It chooses an explicit policy: keep stable DSL/app API and extension contracts root-public, keep deprecated compatibility exports available, and remove named root exports for runtime internals.

This matches the source concern in `proposed-improvements.md`: the package root currently exposes low-level runtime/pipeline seams and should not expand stable API around implementation plumbing while the architecture is still fluid.

## Scope drift

- missing requested scope: none found.
- unapproved added scope: none blocking. The plan intentionally avoids adding new package subpaths, changing runtime behavior, redesigning descriptor opacity, or removing deprecated config fields.

## Contract coverage

- behavior/workflow: covered. The only intended behavior change is TypeScript root import compatibility; runtime command/query/read-model/processor behavior is explicitly unchanged.
- events/replay: covered. The plan states no event model, payload, validation, replay, or migration changes.
- request/response/shared types/callers: covered. Root export contract delta names removed symbols, kept public symbols, deprecated compatibility exports, and caller/test impacts.
- persistence/migrations/read models: covered. Event stores, projection adapters, read interpreter runtime behavior, read-model query behavior, and migration/replay are unchanged.
- auth/security/visibility: covered as not applicable; no auth-specific root API or denial semantics are touched.
- side effects/automations: covered. Processor/effect execution stays unchanged, and effect adapter contracts remain root-public.
- invariants/observability: covered enough for this API-surface issue. The key invariant is that root exports only intentional stable/API-extension names, verified through `src/index.ts`, typecheck, lint, and tests. No new runtime diagnostics are warranted.
- rollout/deploy order: covered. The plan calls out the breaking root TypeScript API delta, pre-1.0 context, no unstable/internal subpath in this rollout, and release-note alternatives.
- tests/QA: covered. The plan updates the type-check fixture, keeps internal subsystem tests on internal imports, adds positive/negative API checks where feasible, and requires full repo gates.

## Failure modes checked

- External consumers importing removed runtime internals fail to compile: acknowledged as a deliberate breaking pre-1.0 cleanup with release-note guidance.
- DCB error detail types become unnameable after hiding `SliceDeps`: mitigated by keeping `BoundaryObservation` and `BoundaryObservationError` root-public and moving only the dependency bag out of root.
- Runtime tests accidentally rely on root internals: research found no root callers for executor/interpreter internals, and the plan keeps internal tests importing internal modules directly.
- Public declarations still leak internal implementation types through helper return types or `Processor`/`compose` shapes: acknowledged as a watch/follow-up item rather than expanding this issue into an opaque-type redesign.
- Deprecated read-model compatibility is removed prematurely: mitigated by keeping deprecated compatibility exports and `AppConfig` fields.
- API sentinel weakens too much: mitigated by preserving positive type coverage for DSL, extension contracts, error contracts, and operation helper types.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- When removing named root exports, verify the generated/type-visible root API does not accidentally require consumers to name `ReadInterpreter`, `ProjectionStore`, `SliceDeps`, `Step`, or other removed internals through exported signatures.
- If `compose` array-form or `Processor` declaration leakage makes removed internals practically visible, do not redesign opacity in this issue; record a focused follow-up unless typecheck forces a small local fix.
- Keep `BoundaryObservation` and `BoundaryObservationError` root-public and preserve type-check coverage because they are observable error/detail contracts.
- Keep deprecated `ProjectionAdapterEntry`, `ProjectionAdapterTableEntry`, `ProjectionAdapterViewEntry`, `projectionAdapters`, and `projectionQuery` compatibility unless a separate removal issue/release decision is made.
- Prefer negative API checks for removed exports, but if TypeScript import-error assertions prove brittle, use a targeted source/export inspection check as planned.
- Include release-note wording or a durable note listing removed root exports and supported alternatives before deployment.

## Next handoff

Use `{{/skill:breakdown 9jzss-public-runtime-surface --from plan/01-implementation-plan.md}}`.
