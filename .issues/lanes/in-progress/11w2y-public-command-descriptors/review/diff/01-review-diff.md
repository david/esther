# Review Diff Digest — Public command definition descriptors

Review source: issue-scoped diff `6594831..HEAD` for `11w2y-public-command-descriptors` (`src/**`, `src/index.ts`, `llms.txt`, issue artifacts). Branch baseline refreshed from `origin/main`; current `HEAD` is 18 commits ahead and 0 behind. Full branch also contains prior `yczmr-dcb-docs` work, excluded from semantic review.

## Executive Summary

- Public TypeScript command descriptor contract changed: `CommandDefinition` removed from root, replaced by `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `commandDefinition`, `EventPayloadInputOf`, and `EventCandidateOf`.
- Runtime command semantics mostly unchanged: definition-backed commands still set `eventSchema`, validate candidate before append, and raw commands remain unvalidated by event definitions.
- Highest risk: `commandDefinition(...)` / `AnyCommandDefinition` currently erase inline definition-backed inference. Bad payload candidates can pass typecheck when wrapped inline, and unannotated wrapper callbacks see `never`.
- Persistence, replay, auth, read-model, and side-effect contracts unchanged.
- Tests expanded heavily, but missing key type tests for inline `commandDefinition({...})` and `defineCommand(commandDefinition({...}))` failure modes.

## High-Risk Changes

1. **Category**: Boundary contract / public DSL typing
   - **Change**: `AnyCommandDefinition` uses broad internal structural helper types with `never` callback inputs and `unknown` payload/output instead of preserving `EventDefinition` → `EventPayloadInputOf` / `EventOf` relationships.
   - **Why it matters**: Inline `commandDefinition({ ... })` is documented as public wrapper/inference anchor, but current shape erases the very candidate typing it was meant to preserve.
   - **Risk**: High — caller-facing type break/regression; bad definition-backed payload fields can bypass compile-time checks when passed through `commandDefinition`, leaving only runtime schema validation.
   - **Confidence**: High — direct repro via temporary typecheck probe.
   - **Files**: `src/core/slice.ts`, `src/__tests__/type-check.ts`, `llms.txt`
   - **Follow-ups**: See `review/findings/01-command-definition-erases-inline-inference.md`.

## Event Model Changes

### Added

None. No new application event names.

### Removed

None.

### Changed

No serialized event payload shape changes. Helper types added:

```ts
EventPayloadInputOf<TDefinition> = z.input<TPayloadSchema>
EventCandidateOf<TDefinition> = EventRecordInput<TType, z.input<TPayloadSchema>>
```

These are compile-time candidate helpers only.

## Boundary Contract Changes

### Shared/public TypeScript API

- Added root exports:
  - `RawCommandDefinition`
  - `DefinitionBackedCommandDefinition`
  - `AnyCommandDefinition`
  - `commandDefinition`
  - `EventPayloadInputOf`
  - `EventCandidateOf`
- Removed root public `CommandDefinition` alias/name.
- `defineCommand(...)` overloads now reference public descriptor names instead of private `EventDefinitionCommandDefinition`.

### Route/API contracts

None.

### Exported/public types

Semantic public break is intentional: callers using `CommandDefinition` must migrate to raw vs definition-backed names.

### Duplicate schema/type mirrors and drift

No duplicate schema/type mirrors found. Canonical descriptor types live in `src/core/slice.ts`; event candidate helpers live in `src/core/event.ts`; root re-exports are thin.

## Persistence Changes

None. No table, migration, read-model storage, event storage, or replay shape change.

## Authorization Changes

None.

## Workflow / State Changes

None in runtime domain workflow. Issue workflow moved through implementation tasks; index still needed review update.

## Intent Preservation / Semantic Handles

- Good: new semantic handles match plan vocabulary: `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `EventPayloadInputOf`, `EventCandidateOf`, `commandDefinition`.
- Gap: `AnyCommandDefinition` implementation hides important relationship between definition-backed `event`, `payload`, and `output` behind broad `never`/`unknown` helpers. Name says safe descriptor union, implementation behaves like weak structural acceptor.

## Side-Effect Changes

None. Runtime tests assert invalid definition-backed candidates do not append or fan out to projector/processor/effect/output. Raw command path remains unvalidated.

## Test Coverage Delta

Added/changed coverage:

- Public root export/import type coverage.
- Raw and definition-backed descriptor assignment tests.
- Wrapper forwarding tests for pre-typed descriptors.
- `EventPayloadInputOf` / `EventCandidateOf` transform payload tests.
- Runtime `commandDefinition` identity test.
- Runtime `eventSchema` preservation and raw-path `eventSchema` absence assertions.

Missing coverage:

- Inline `commandDefinition({ ... })` should infer `ctx` and `event` callback types.
- `defineCommand(commandDefinition({ ...bad payload... }))` should fail typecheck.
- Inline transform payload through `commandDefinition` should keep candidate payload as schema input and `output` event as schema output.

## Scattered Logic Signals

No scattered business-rule signal. Change is localized to event helper types, command descriptor types, root exports, docs, and tests.

## Missing Counterparts

- **Likely missing counterpart**: Type tests for inline `commandDefinition` usage matching docs/feature scenario. Existing tests use explicitly annotated `DefinitionBackedCommandDefinition` variables, so they do not catch inference erasure.
- **No obvious gap found**: Root exports and `llms.txt` were updated for new public names.
- **No obvious gap found**: Runtime counterpart tests cover candidate validation and raw path behavior.

## Verification Performed During Review

- `git fetch origin main` — baseline refreshed.
- `git rev-list --left-right --count HEAD...origin/main` — `18 0`.
- `bun run typecheck` — pass before temporary repro probes.
- `bun run test` — pass, 280 tests.
- `bun run lint` — pass.
- Temporary type probes showed missing type rejection for inline `commandDefinition` bad payload and `never` callback context; probes removed before artifact write.

## Next Handoff

{{/skill:breakdown 11w2y-public-command-descriptors --from review/findings/01-command-definition-erases-inline-inference.md}}
