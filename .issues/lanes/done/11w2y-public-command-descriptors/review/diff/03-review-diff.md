# Review Diff Digest — Public command descriptors after wrapper helper

Review source: issue-scoped diff `6594831..HEAD` for `11w2y-public-command-descriptors` (`src/**`, `src/index.ts`, `llms.txt`, issue artifacts). Branch baseline refreshed from `origin/main`; current `HEAD` is 26 commits ahead and 0 behind. Prior `yczmr-dcb-docs` work is outside this semantic review.

## Executive Summary

- Public command descriptor API now includes raw and definition-backed descriptors, candidate/input event helpers, `commandDefinition(...)`, and wrapper-author `commandDefinitionWrapper(...)`.
- Highest-risk previous finding is resolved: direct `authenticated({...})` style wrappers built with `commandDefinitionWrapper(...)` contextually type unannotated `validate`, `tags`, `payload`, and `output` callbacks.
- Runtime command semantics remain unchanged: definition-backed commands still validate event candidates before append/fanout; raw commands stay unvalidated by event definitions.
- Change set is mixed: semantic public TypeScript API additions plus mostly mechanical/docs/workflow updates.
- No actionable review findings found. Automated gates pass for reviewed change set.

## High-Risk Changes

1. **Category**: Boundary contract / public TypeScript API
   - **Change**: Root exports add `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `commandDefinition`, `CommandDefinitionWrapper`, `commandDefinitionWrapper`, `EventPayloadInputOf`, and `EventCandidateOf`; old ambiguous root `CommandDefinition` remains absent.
   - **Why it matters**: This is public DSL surface for extension authors; bad typing here would force private shape copies or `unknown` casts.
   - **Risk**: Medium — caller-facing type API change, but tests cover direct wrapper inference, candidate/input vs parsed/output distinction, and missing old export.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/core/event.ts`, `src/index.ts`, `src/__tests__/type-check.ts`, `llms.txt`.
   - **Follow-ups**: None.

2. **Category**: Runtime event validation invariant
   - **Change**: Definition-backed descriptor names/helpers changed, but runtime branch still sets `eventSchema = eventDefinition.schema`; raw branch still leaves `eventSchema = undefined`.
   - **Why it matters**: If definition-backed commands collapsed into raw factories, malformed event candidates could append/fan out.
   - **Risk**: Medium — replay/storage behavior would be high-risk if changed, but inspected code and runtime tests show no behavior delta.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/core/pipeline.ts`, `src/__tests__/pipeline-wiring.test.ts`.
   - **Follow-ups**: None.

3. **Category**: Wrapper-author contract
   - **Change**: `commandDefinitionWrapper(...)` exposes Esther-owned overloads for wrapper call sites and documents plain `T extends AnyCommandDefinition` as already-typed forwarding only.
   - **Why it matters**: Resolves prior direct inline wrapper inference gap without pretending TypeScript can contextually type generic wrapper bodies.
   - **Risk**: Medium — helper supports safe overload reuse; transform callback remains broad and documented as contract-preserving behavior/metadata, not arbitrary descriptor rewriting.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/__tests__/type-check.ts`, `llms.txt`, `.issues/lanes/in-progress/11w2y-public-command-descriptors/impl/06.md`.
   - **Follow-ups**: None.

## Event Model Changes

### Added

None.

### Removed

None.

### Changed

No serialized event names, payloads, tags, or replay shapes changed. Compile-time helpers added:

```ts
EventPayloadInputOf<TDefinition> = z.input<TPayloadSchema>
EventCandidateOf<TDefinition> = EventRecordInput<TType, z.input<TPayloadSchema>>
```

## Boundary Contract Changes

### Shared schemas

None.

### Route/API contracts

None.

### Exported/public types

- Added public root exports:
  - `RawCommandDefinition`
  - `DefinitionBackedCommandDefinition`
  - `AnyCommandDefinition`
  - `CommandDefinitionWrapper`
  - `commandDefinition`
  - `commandDefinitionWrapper`
  - `EventPayloadInputOf`
  - `EventCandidateOf`
- Removed/kept absent:
  - `CommandDefinition` root export.
- `defineCommand(...)` overloads now consume public descriptor names.

### Duplicate schema/type mirrors and drift

No duplicate schema mirrors found. Root exports are thin re-exports from `src/core/slice.ts` and `src/core/event.ts`.

## Persistence Changes

None. No schema, migration, repository, read model, stored JSON, stored event, or replay change.

## Authorization Changes

None. `authenticated` examples are wrapper-shape examples only; no auth policy or runtime guard added.

## Workflow / State Changes

No app workflow/state semantics changed. Issue workflow can move to QA planning because review has no actionable findings and gates passed.

## Intent Preservation / Semantic Handles

- Good: Plan vocabulary is now visible in public code seams: `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `commandDefinition`, `CommandDefinitionWrapper`, `commandDefinitionWrapper`, `EventPayloadInputOf`, `EventCandidateOf`.
- Good: `llms.txt` explains schema-input candidate payload vs parsed output event and direct-wrapper helper limitation.
- Watch item, not blocker: `AnyCommandDefinition` stays broad for already-typed forwarding; direct inline contextual typing intentionally belongs to `commandDefinition(...)` / `commandDefinitionWrapper(...)` overloads.

## Side-Effect Changes

None. Processor/read-model/effect fanout behavior unchanged and covered by runtime tests for malformed definition-backed candidates.

## Test Coverage Delta

Added/covered:

- Root import and removed `CommandDefinition` checks.
- Public descriptor identity for raw and definition-backed descriptors.
- Already-typed `T extends AnyCommandDefinition` forwarding.
- Direct `commandDefinition({...})` contextual typing.
- Direct `commandDefinitionWrapper(...)` wrapper call with unannotated callbacks.
- Composed input enrichment visible in `validate`, `tags`, `payload`, and `output`.
- `outputErr` forwarding/merge typing on descriptor identity path.
- Bad payload field/type rejected through `defineCommand(...)`.
- Transform schema candidate input vs parsed output event split.
- Runtime identity, wrapper metadata preservation, malformed candidate rejection before append/fanout, and raw path unchanged.

No skipped or removed tests found in reviewed diff.

## Missing Counterparts

- **No obvious gap found**: Root exports, docs, type tests, and runtime tests align with public descriptor API changes.
- **No obvious gap found**: Previous finding 02 has direct wrapper helper tests and docs explaining unsupported plain generic wrapper limitation.
- **No obvious gap found**: Runtime validation invariant has counterpart tests.

## Verification Performed During Review

- `git fetch origin main` — baseline refreshed.
- `git rev-list --left-right --count HEAD...origin/main` — `26 0`.
- `git diff --stat 6594831..HEAD -- src src/index.ts llms.txt .issues/lanes/in-progress/11w2y-public-command-descriptors` — issue-scoped inventory.
- `rg "\bCommandDefinition\b|EventDefinitionCommandDefinition|CommandEventCandidate|DefinitionBackedCommandPayloadInput" src llms.txt` — only intentional docs/test mentions remain.
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run test` — pass, 281 tests.

## Next Handoff

{{/skill:plan-qa 11w2y-public-command-descriptors}}
