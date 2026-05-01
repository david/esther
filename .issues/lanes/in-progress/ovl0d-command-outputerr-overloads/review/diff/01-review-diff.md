# Review Diff Digest — Command outputErr descriptor overloads

## Executive Summary
- Public TypeScript command-helper contract expands: required-`outputErr` definition-backed descriptors now accepted by `commandDefinition(...)` and `defineCommand(...)`.
- Change set is mostly semantic at type/API boundary, with no observed runtime command execution, event model, persistence, auth policy, or side-effect change.
- Highest-risk area: overload ordering/inference. Added type fixture covers generic CMS-shaped wrapper, named/unnamed command paths, descriptor identity, and definition-backed event typing.
- No actionable code follow-ups found in inspected diff.

## Change Inventory
- Code changed: `src/core/slice.ts`
- Type tests changed: `src/__tests__/type-check.ts`
- Docs changed: `llms.txt`
- Workflow artifacts added: issue description, plan, plan check, impl task, checkpoint
- Migrations added: none
- Tests removed: none

## High-Risk Changes
1. **Category**: Boundary contract / public TypeScript API
   - **Change**: Added required-`outputErr` definition-backed overloads for `commandDefinition(...)` and named/unnamed `defineCommand(...)`.
   - **Why it matters**: Downstream generic wrappers can pass `DefinitionBackedCommandDefinitionWithOutputErr<...>` directly instead of routing through conditional `DefinitionBackedCommandDefinition` or using unsafe casts.
   - **Risk**: Medium. Type-only contract change, but overload precedence and generic inference can silently widen names or event candidates if wrong.
   - **Confidence**: High. Overloads are placed before conditional definition-backed overloads; fixture calls both helpers inside generic wrapper boundary.
   - **Files**: `src/core/slice.ts`, `src/__tests__/type-check.ts`
   - **Follow-ups**: None found.

2. **Category**: Event contract preservation
   - **Change**: Required-`outputErr` descriptors still use `EventDefinition` path and return `EventOf<TEventDefinition>` / `EventCandidateOf<TEventDefinition>` command typing.
   - **Why it matters**: Avoids raw-event downgrade and keeps schema-backed event validation path visible.
   - **Risk**: Medium. Public type surface is event/replay-adjacent, though runtime body unchanged.
   - **Confidence**: High. Runtime branch still checks `typeof definition.event === "function"`; fixture asserts command event candidate and output event typing.
   - **Files**: `src/core/slice.ts`, `src/__tests__/type-check.ts`
   - **Follow-ups**: None found.

## Event Model Changes
### Added
- None.

### Removed
- None.

### Changed
- No event name, payload, tag, producer, consumer, replay, or migration change observed.
- Definition-backed event schema path preserved.

## Boundary Contract Changes
### shared schemas
- None.

### route/API contracts
- None.

### exported/public types
- Additive public TS overload support:
  - `commandDefinition(DefinitionBackedCommandDefinitionWithOutputErr<...>)`
  - `defineCommand(DefinitionBackedCommandDefinitionWithOutputErr<...> & { name: TName })`
  - `defineCommand(DefinitionBackedCommandDefinitionWithOutputErr<...>)`
- Existing exports already cover `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers`; no export gap observed in `src/index.ts`.

### duplicate schema/type mirrors and drift
- No duplicate runtime schema mirror touched.
- `llms.txt` updated to match new public helper acceptance.

## Persistence Changes
### schema/migrations
- None.

### read models/projectors
- None.

### repositories/query contracts
- None.

## Authorization Changes
- No Esther core auth policy change.
- Auth-adjacent wrapper authoring becomes safer at type boundary because auth/session error widening no longer needs downstream unsafe cast.

## Workflow / State Changes
- Issue workflow artifacts added for current work item.
- Pre-review index had stale `Lane: backlog` despite path under `lanes/in-progress`; review index update should keep workflow metadata aligned.

## Intent Preservation / Semantic Handles
- Intent is visible through overload names/types and type fixture:
  - `acceptRequiredOutputErrDescriptor`
  - `preserveNamedCommandIdentity`
  - `preserveDefinitionBackedEventContract`
  - `descriptorIdentityForWrappers`
  - `conditionalOutputErrBypass`
- No hidden runtime behavior bundled into overload change.

## Side-Effect Changes
- None observed. Runtime command body unchanged except implementation signature accepts broadened union.

## Test Coverage Delta
- Added compile-time coverage in `src/__tests__/type-check.ts` for:
  - generic CMS-shaped wrapper boundary
  - `mergeOutputErrHandlers(...)` with added auth error
  - `commandDefinition(descriptor)` identity preservation
  - named `defineCommand(descriptor)` preserving `TName`
  - unnamed required-`outputErr` descriptor returning `string` name
  - definition-backed event candidate/output typing
- `bun run typecheck`: pass during review.
- Full lint/test pass recorded in implementation checkpoint, not rerun by this review.

## Scattered Logic Signals
- No meaningful scattered business logic signal. Overload duplication is expected TypeScript API surface, not domain-rule spread.

## Missing Counterparts
- **No obvious gap found** for public exports: `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers` already exported.
- **No obvious gap found** for docs: `llms.txt` updated for new descriptor acceptance.
- **No obvious gap found** for event/persistence/auth runtime counterparts: no such behavior changed.

## Next Handoff
- No actionable code findings. Next useful workflow step: run/record full gates for reviewed change set.
