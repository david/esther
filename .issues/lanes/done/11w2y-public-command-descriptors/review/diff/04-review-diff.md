# Review Diff Digest — Wrapper-safe outputErr descriptor support

Review source: current branch vs refreshed `origin/main` for `11w2y-public-command-descriptors` (`origin/main...HEAD`). Branch is 7 commits ahead and 0 behind.

## Executive Summary

- Public command wrapper API now adds `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers(...)` for wrapper-safe input replacement plus error-union widening.
- Highest-risk invariant is preserved: definition-backed commands still keep `event: EventDefinition` and validate malformed candidates before append/fanout/output/effects.
- Runtime command behavior is intentionally unchanged except handler-map construction helper; helper uses deterministic object-spread semantics where added handlers win duplicate `type` keys.
- Change set is mixed: semantic public TypeScript API addition, runtime tests/type tests/docs, plus workflow artifact updates.
- No actionable code findings found. One workflow artifact counterpart was stale before this review: issue index still said impl 07-09 pending despite checkpoints/code complete; review update fixes index state.
- Automated gates pass for reviewed change set.

## High-Risk Changes

1. **Category**: Boundary contract / public TypeScript API
   - **Change**: Root exports add `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers(...)`; `llms.txt` documents wrapper-safe composition.
   - **Why it matters**: Wrapper authors can now name required-`outputErr` definition-backed descriptors and merge base+added handler maps without private descriptor mirrors or downstream `as unknown as ...` casts.
   - **Risk**: Medium — caller-facing API expansion; no runtime/storage contract change.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/index.ts`, `llms.txt`, `src/__tests__/type-check.ts`.
   - **Follow-ups**: None.

2. **Category**: Output error routing / bounded cast
   - **Change**: `mergeOutputErrHandlers(baseHandlers, addedHandlers)` spreads handler maps and casts merged key-space to `OutputErrHandlers<TBaseError | TAddedError, ...>`.
   - **Why it matters**: TypeScript cannot prove generic mapped-key coverage after object spread; this is intended place for unsoundness to live.
   - **Risk**: Medium — duplicate error `type` keys use added-handler-wins behavior; ambiguous duplicate domain error names remain caller design risk.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/__tests__/pipeline-wiring.test.ts`, `src/__tests__/type-check.ts`, `llms.txt`.
   - **Follow-ups**: None. Cast is local and documented; runtime tests cover base, added, and `undefined` base routing.

3. **Category**: Event validation / replay-sensitive invariant
   - **Change**: Wrapper-safe descriptor typing changes public surface, but definition-backed `defineCommand(...)` path still sets `eventSchema = eventDefinition.schema`.
   - **Why it matters**: Raw downgrade would allow malformed event candidates to append/fan out; that would be replay/storage-sensitive.
   - **Risk**: Low after inspection/tests — no event wire shape, event name, tag, payload, replay, or migration behavior changed.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/__tests__/pipeline-wiring.test.ts`, `src/__tests__/type-check.ts`.
   - **Follow-ups**: None.

4. **Category**: Workflow artifact counterpart
   - **Change**: Implementation checkpoints 07-09 and code are present, but issue index still described tasks 07-09 as pending before this review.
   - **Why it matters**: Next workflow handoff would send agent back to implementation despite completed code and passing gates.
   - **Risk**: Low for product/code; medium for workflow correctness.
   - **Confidence**: High.
   - **Files**: `.issues/lanes/in-progress/11w2y-public-command-descriptors/index.md`.
   - **Follow-ups**: Fixed by this review artifact update; no code follow-up needed.

## Event Model Changes

### Added

None.

### Removed

None.

### Changed

None. No serialized event names, payload shapes, tags, event schema versions, reducer/projector/processor subscriptions, or replay behavior changed.

## Boundary Contract Changes

### Shared schemas

None.

### Route/API contracts

None.

### Exported/public types

Added public root export:

```ts
DefinitionBackedCommandDefinitionWithOutputErr
```

Added public root value export:

```ts
mergeOutputErrHandlers
```

Semantics:

```ts
mergeOutputErrHandlers(baseHandlers, addedHandlers)
// => OutputErrHandlers<TBaseError | TAddedError, TOutput, TCtx, TInput>
```

`baseHandlers` may be `undefined`; `addedHandlers` is required. Duplicate keys resolve by object-spread precedence, so added handlers win.

### Duplicate schema/type mirrors and drift

No duplicate schema mirrors found. Root exports are thin re-exports from `src/core/slice.ts`.

## Persistence Changes

None. No DB schema, migration, stored event, read model, repository, projection, or replay change.

## Authorization Changes

No core auth policy change. Authenticated/session terms appear only in type fixtures proving wrapper composition and output-error handling.

## Workflow / State Changes

No application workflow/state change. Issue workflow state updated by this review to reflect implementation tasks 07-09 complete and review 04 recorded.

## Intent Preservation / Semantic Handles

- Good: Plan vocabulary appears in code as `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers`.
- Good: Bounded unsoundness is named and colocated in framework helper instead of downstream wrappers.
- Good: `llms.txt` explains required-outputErr wrappers, `undefined` base handlers, added-handler precedence, and event-validation preservation.
- Watch item only: duplicate error `type` keys remain semantically ambiguous across unions; docs state deterministic precedence, but domain authors should avoid collisions.

## Side-Effect Changes

None. New helper only constructs handler map. No I/O, processor, effect, projection, or append behavior added.

## Test Coverage Delta

Added/covered:

- Root imports compile for new public type/helper.
- Generic authenticated wrapper starts from `DefinitionBackedCommandDefinition` and returns `DefinitionBackedCommandDefinitionWithOutputErr`.
- Wrapper input replacement and enriched `TCtx` visible to `validate`, `tags`, `payload`, `output`, and `outputErr` handlers.
- `mergeOutputErrHandlers(definition.outputErr, authHandlers)` returns widened handler map.
- `mergeOutputErrHandlers(undefined, addedHandlers)` compiles and routes at runtime.
- Base and added error handlers route by `type` after `defineCommand(...)` normalization.
- Wrapped definition-backed malformed event candidate rejects with `SchemaError("Event validation failed", issues)` before append/fanout/output/effects.

No skipped or `.only` tests found in reviewed files.

## Missing Counterparts

- **No obvious code gap found**: public exports, docs, type tests, and runtime tests align with new wrapper-safe outputErr API.
- **No obvious event/replay gap found**: no event model changed, and validation invariant has runtime coverage.
- **Workflow gap fixed during review**: issue index now reflects completed impl tasks and next handoff.

## Verification Performed During Review

- `git fetch origin main` — baseline refreshed.
- `git rev-list --left-right --count HEAD...origin/main` — `7 0`.
- `git diff --stat origin/main...HEAD` and `git diff --name-status origin/main...HEAD` — reviewed inventory.
- Inspected `src/core/slice.ts`, `src/index.ts`, `src/__tests__/type-check.ts`, `src/__tests__/pipeline-wiring.test.ts`, `llms.txt`, issue plan/spec/checkpoints, repo docs.
- `rg "DefinitionBackedCommandDefinitionWithOutputErr|mergeOutputErrHandlers|CommandOutputErrDefinition|OutputErrHandlers" src llms.txt` — public/helper usage aligned.
- `rg "as unknown as" src/core/slice.ts src/__tests__/type-check.ts src/__tests__/pipeline-wiring.test.ts llms.txt` — no downstream wrapper double assertion in type fixture; only bounded runtime/test casts and docs mention.
- `rg "\\.only\\(|\\.skip\\(" src/__tests__/pipeline-wiring.test.ts src/__tests__/type-check.ts` — no focused/skipped tests.
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run test` — pass, 284 tests.

## Next Handoff

{{/skill:plan-qa 11w2y-public-command-descriptors}}
