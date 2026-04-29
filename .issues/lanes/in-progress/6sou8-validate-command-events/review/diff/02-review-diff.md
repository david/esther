# Review Diff Digest — validate command events follow-up

Date: 2026-04-29
Source: issue-owned command-event validation delta in `origin/main..HEAD`, with unrelated `bs43i-tighten-query-where` lane move excluded. Focused re-review after tasks 04-06 resolved `review/findings/01-transform-schema-validation.md`.

## Executive Summary
- Public command DSL now models definition-backed emission as candidate vs parsed event: `payload(ctx)` returns `z.input`, direct `command.event(ctx)` returns pre-parse candidate, `output(event, ctx)` receives parsed `z.output` event.
- Runtime now validates definition-backed candidates through `EventDefinition.schema`, appends parsed event, and skips append/projectors/processors/effects/output on `SchemaError("Event validation failed", issues)`.
- Transform-schema mismatch from prior review is resolved by type tests, runtime tests, and docs.
- Highest-risk remaining area: runtime overload discriminator uses presence of `tags` and `payload`, so a raw command object with extra helper fields named `tags`/`payload` can be misclassified as definition-backed and append malformed events.
- Change set is semantic, with docs/tests aligned for main intended path.

## High-Risk Changes

1. Raw command object misclassification by runtime discriminator
- **Category**: boundary-facing DSL / persistence-sensitive event construction
- **Change**: `defineCommand` implementation chooses definition-backed path when `"tags" in definition && "payload" in definition`, not when `definition.event` is an `EventDefinition` object.
- **Why it matters**: raw `CommandDefinition` is structurally typed. A reusable raw command definition object can carry extra helper properties named `tags` and `payload`; TypeScript still accepts it as raw command, but runtime will ignore raw `event(ctx)`, use `definition.event.type` from a function (`undefined`), and can append malformed `{ type: undefined, ... }` events without event schema validation.
- **Risk**: High — conditionally persistence/replay-sensitive and caller-visible; malformed events can be stored by raw interop path.
- **Confidence**: High for code path; medium for caller prevalence.
- **Files**: `src/core/slice.ts`
- **Follow-ups**: Add regression test/type fixture for raw command definitions with extra `tags`/`payload` fields, then discriminate on `definition.event` shape (for example, event is non-function `EventDefinition`) instead of helper-field presence.

2. Definition-backed transform contract now explicit
- **Category**: boundary-facing DSL / replay-sensitive parsing
- **Change**: `payload(ctx)` uses schema input, direct command event is candidate input, pipeline appends parsed schema output.
- **Why it matters**: transform payload schemas where `z.input` differs from `z.output` now typecheck and run consistently.
- **Risk**: Medium — public API meaning changed, but additive and covered.
- **Confidence**: High
- **Files**: `src/core/slice.ts`, `src/core/pipeline.ts`, `src/__tests__/type-check.ts`, `src/__tests__/pipeline-wiring.test.ts`, `doc/domain-language.md`, `llms.txt`
- **Follow-ups**: none beyond discriminator finding above.

## Event Model Changes

### Added
- No framework event names added.
- User-authored commands can use `EventDefinition` as command event source with pre-append schema validation.

### Removed
- None.

### Changed
```ts
// definition-backed direct command.event(ctx)
EventRecordInput<EventType, z.input<TPayloadSchema>>

// appended event and output(event, ctx)
EventRecordInput<EventType, z.output<TPayloadSchema>>
```

- Raw `event(ctx) => EventRecordInput` path remains intended unvalidated path.
- Potential discriminator bug can accidentally move some raw definitions onto definition-backed construction at runtime.

## Boundary Contract Changes

### Shared schemas
- `EventDefinition.schema` now validates definition-backed command event candidates before append.
- `SchemaError("Event validation failed", issues)` is new framework failure path for malformed definition-backed command events.

### Route/API contracts
- `app.dispatch(sliceName, input)` shape unchanged.
- No adapter route or transport changes.

### Exported/public types
- `Command` gained trailing `TEventCandidate` generic and optional `eventSchema` metadata.
- `defineCommand` gained event-definition-backed overloads.
- `CommandDefinition` raw form remains exported and compatible by type, but runtime discriminator needs hardening for extra-property raw objects.

### Duplicate schema/type mirrors and drift
- No duplicate schema drift found. Docs mirror same candidate-vs-parsed wording in `doc/domain-language.md` and `llms.txt`.

## Persistence Changes

### Schema/migrations
- None.

### Read models/projectors
- Malformed definition-backed events fail before append, so projectors do not run.
- Transform success test proves parsed output payload is what reducers/read-side schemas see.

### Repositories/query contracts
- None.

## Authorization Changes

- None.

## Workflow / State Changes

- Command execution order changed for definition-backed events: build candidate → validate/parse event → append parsed event → output parsed event.
- Framework `SchemaError` from event validation bypasses `outputErr`, matching existing framework-error behavior.

## Side-Effect Changes

- Definition-backed validation failure prevents append, projectors, processors, effects, and `output`.
- Raw path remains intentionally unvalidated, except discriminator bug can corrupt raw-path construction when extra helper fields exist.

## Test Coverage Delta

- Added type coverage for transform payload schema input vs output, direct `command.event(ctx)` candidate shape, parsed `output(event)` shape, invalid payload/tags, and raw interop.
- Added runtime coverage for valid transform parse/append/output and malformed transform candidate no-append/no-downstream behavior.
- Missing focused coverage: raw command definition object with extra `tags`/`payload` helper fields should still use raw `event(ctx)`.

## Scattered Logic Signals

- No scattered business-rule signal. Candidate-vs-parsed ownership is centralized in `defineCommand` typing plus `executeCommand` parse step.

## Missing Counterparts

- **Likely missing counterpart**: regression test plus runtime guard for raw command extra-property collision.
- **No obvious gap found**: transform-schema contract, docs, event validation failure path, append options, projector/processor/effect skip behavior.

## Next Handoff

- Actionable review follow-up exists: {{/skill:breakdown 6sou8-validate-command-events --from review/findings/02-raw-command-discriminator.md}}
