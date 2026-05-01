# Review Diff Digest — Public command descriptors after inference follow-up

Review source: issue-scoped diff `6594831..HEAD` for `11w2y-public-command-descriptors` (`src/**`, `src/index.ts`, `llms.txt`, issue artifacts). Branch baseline refreshed from `origin/main`; current `HEAD` is 21 commits ahead and 0 behind. Prior `yczmr-dcb-docs` work is outside this semantic review.

## Executive Summary

- Public command descriptor API is now mostly in place: root exports expose raw/definition-backed descriptors, event candidate helpers, and `commandDefinition(...)`.
- Runtime command behavior remains unchanged: definition-backed commands still construct candidates, set `eventSchema`, validate before append/fanout, and raw commands stay raw.
- Previous inline `commandDefinition({...})` inference issue is partially fixed: direct `commandDefinition({...})` now contextually types callbacks and rejects bad payloads once passed to `defineCommand`.
- Highest remaining risk: extension-style direct wrappers `wrap<T extends AnyCommandDefinition>(definition: T)` still cannot accept inline descriptors without callback annotations because public `AnyCommandDefinition` remains too broad for contextual typing.
- No persistence, replay, auth, read-model, workflow-state, or side-effect contract changed.

## High-Risk Changes

1. **Category**: Boundary contract / public DSL typing
   - **Change**: `AnyCommandDefinition` is still a broad public structural union with `unknown` callback fields. `commandDefinition(...)` overloads fix direct identity usage, but not extension wrappers that accept inline descriptors through `T extends AnyCommandDefinition`.
   - **Why it matters**: Plan/task acceptance says wrappers should accept valid inline and pre-typed descriptors without casts or copying private overload shapes. Direct wrapper usage currently fails on unannotated `tags`, `payload`, and `output` callbacks with implicit `any`.
   - **Risk**: High — key extension API scenario remains broken; extension authors still must force callers through `commandDefinition({...})`, annotate callbacks, or duplicate overload shapes.
   - **Confidence**: High — temporary typecheck probe reproduced `TS7006` on direct wrapper inline descriptor; probe removed.
   - **Files**: `src/core/slice.ts`, `src/__tests__/type-check.ts`, `.issues/lanes/in-progress/11w2y-public-command-descriptors/impl/05.md`
   - **Follow-ups**: See `review/findings/02-direct-wrapper-inline-inference.md`.

## Event Model Changes

### Added

None.

### Removed

None.

### Changed

No serialized event payload shape changes. Added helper types remain compile-time only:

```ts
EventPayloadInputOf<TDefinition> = z.input<TPayloadSchema>
EventCandidateOf<TDefinition> = EventRecordInput<TType, z.input<TPayloadSchema>>
```

## Boundary Contract Changes

### Shared/public TypeScript API

- Root exports added/kept:
  - `RawCommandDefinition`
  - `DefinitionBackedCommandDefinition`
  - `AnyCommandDefinition`
  - `commandDefinition`
  - `EventPayloadInputOf`
  - `EventCandidateOf`
- Root `CommandDefinition` remains intentionally absent.
- `defineCommand(...)` overloads use public descriptor names.
- `commandDefinition(...)` now has family-specific overloads before generic identity overload.

### Route/API contracts

None.

### Exported/public types

- Intentional breaking TypeScript API cleanup: callers migrate from removed `CommandDefinition` to `RawCommandDefinition` or `DefinitionBackedCommandDefinition`.
- Remaining issue: `AnyCommandDefinition` does not provide enough contextual structure for direct inline wrapper calls.

### Duplicate schema/type mirrors and drift

No duplicate schema/type mirrors found. Public types live in `src/core/slice.ts` and `src/core/event.ts`; root exports are thin.

## Persistence Changes

None. No schema, migration, repository, read model, stored event, replay, or projection change.

## Authorization Changes

None.

## Workflow / State Changes

Runtime workflow unchanged. Issue workflow needs new review finding breakdown before gates/QA.

## Intent Preservation / Semantic Handles

- Good: code now has visible semantic handles named in plan: `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `commandDefinition`, `EventPayloadInputOf`, `EventCandidateOf`.
- Gap: `AnyCommandDefinition` still behaves more like a loose acceptor than a typed descriptor-family union for wrapper authors. This hides plan intent: “wrappers accept `T extends AnyCommandDefinition` and keep inference.”

## Side-Effect Changes

None. Runtime tests cover malformed definition-backed candidates not appending/fanning out and raw event path staying unvalidated by event definitions.

## Test Coverage Delta

Added/covered:

- Direct `commandDefinition({...})` callback inference.
- Wrapped pre-built descriptors through `T extends AnyCommandDefinition`.
- Bad payload rejection through `defineCommand(commandDefinition(...))`.
- Transform schema input candidate vs parsed output event typing.
- Runtime identity and eventSchema/raw path assertions.

Missing:

- Direct extension wrapper call with inline descriptor:

```ts
function wrap<T extends AnyCommandDefinition>(definition: T): T {
  return commandDefinition(definition);
}

const wrapped = wrap({
  input: compose<Input>(),
  event: Event,
  tags: (ctx) => [ctx.id],
  payload: (ctx) => ({ id: ctx.id }),
  output: (event, ctx) => ok(...),
});
```

Temporary probe failed with `TS7006` implicit `any` on `ctx` / `event` callback params.

## Missing Counterparts

- **Likely missing counterpart**: Type-level regression for direct wrapper inline descriptor acceptance from `impl/05.md` acceptance.
- **No obvious gap found**: Root exports and docs mention new public names and candidate/input vs parsed/output distinction.
- **No obvious gap found**: Runtime validation behavior remains guarded by tests.

## Verification Performed During Review

- `git fetch origin main` — baseline refreshed.
- `git rev-list --left-right --count HEAD...origin/main` — `21 0`.
- `git diff --stat 6594831..HEAD -- src src/index.ts llms.txt .issues/lanes/in-progress/11w2y-public-command-descriptors` — issue-scoped inventory.
- Temporary typecheck probe added direct `wrap<T extends AnyCommandDefinition>({...inline...})`; `bun run typecheck` failed with `TS7006` callback implicit-any errors; probe removed and worktree returned clean before artifacts.

## Next Handoff

{{/skill:breakdown 11w2y-public-command-descriptors --from review/findings/02-direct-wrapper-inline-inference.md}}
