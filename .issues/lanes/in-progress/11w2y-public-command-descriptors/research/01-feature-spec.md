# Feature Spec — Public command definition descriptors

## Summary

| Topic | Value |
|---|---|
| Recommendation | Promote command descriptor shapes to stable public API: `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, optional `AnyCommandDefinition`, and identity `commandDefinition(...)`. |
| Compatibility | Breaking public type cleanup. Remove ambiguous `CommandDefinition`; do not add compatibility alias. Runtime command behavior remains unchanged. |
| Primary surfaces | `src/core/slice.ts`, `src/core/event.ts`, `src/index.ts`, `src/__tests__/type-check.ts`, `src/__tests__/pipeline-wiring.test.ts`, `llms.txt`. |
| Core rule | Descriptor typing becomes public contract; runtime command execution stays unchanged. |
| Main risk | Accidentally collapsing definition-backed commands into raw event factories, losing candidate validation and `z.input`/`z.output` distinction. |
| Verification focus | Type-level wrapper composition plus runtime event-candidate validation before append. |

## Decisions Needed

None.

Defaults chosen:

| Area | Default |
|---|---|
| Existing `CommandDefinition` export | Remove from public API. Replace with explicit `RawCommandDefinition`; no alias. |
| Definition-backed descriptor name | Public `DefinitionBackedCommandDefinition`; remove private `EventDefinitionCommandDefinition` shadow. |
| Union helper | Add public `AnyCommandDefinition` for reusable wrappers. |
| Identity builder | Add `commandDefinition<T extends AnyCommandDefinition>(definition: T): T` in `core/slice.ts`, export from root. |

## Changed Since Last Draft

Revised after product decision: no compatibility alias, no deprecated `CommandDefinition`, intentional breaking public type cleanup.

## Problem

Extensions that wrap `defineCommand(...)` need descriptor types they can compose directly. Today `src/core/slice.ts` has two descriptor shapes:

- `CommandDefinition` — public export, but raw event factory only.
- `EventDefinitionCommandDefinition` — private descriptor for preferred `event: EventDefinition`, `tags(ctx)`, `payload(ctx)` command form.

That leaves public wrapper code with bad options:

- copy private overload shapes,
- cast through `unknown`,
- force definition-backed commands into raw event factories,
- or lose precise typing for `input`, `outputErr`, payload candidates, and output event.

This conflicts with current preferred command DSL. Definition-backed commands must stay first-class and publicly typeable.

## Current Evidence

| Evidence | Location | Meaning |
|---|---|---|
| Raw-only public descriptor | `src/core/slice.ts` `CommandDefinition` | Name suggests generic command descriptor, but only models `event(ctx) => EventRecordInput`. |
| Private definition-backed descriptor | `src/core/slice.ts` `EventDefinitionCommandDefinition` | Needed for preferred `event: EventDefinition` form, but not exported. |
| Runtime distinction already exists | `src/core/slice.ts` `isRawCommandDefinition(...)` and `defineCommand(...)` | Raw path skips `eventSchema`; definition-backed path builds candidate and validates via event schema. |
| Candidate vs stored event typing exists | `src/__tests__/type-check.ts` transform command checks | `payload(ctx)` and `command.event(ctx)` use schema input; `output(event, ctx)` gets parsed output. |
| Docs already prefer definition-backed commands | `llms.txt` Command DSL | Public docs say preferred form is `event: EventDefinition`, `tags`, `payload`. |

## Solution Overview

Make command descriptor shapes stable public API instead of private overload internals.

Add public types in `src/core/slice.ts`:

```ts
export type RawCommandDefinition<...> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input: InputPipeline<TInput, TCtx, TInputError>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: (ctx: TCtx) => TEvent;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
} & CommandOutputErrDefinition<TInput, TCtx, TOutput, TError>;

export type DefinitionBackedCommandDefinition<...> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input: InputPipeline<TInput, TCtx, TInputError>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: TEventDefinition;
  readonly tags: (ctx: TCtx) => ReadonlyArray<string>;
  readonly payload: (ctx: TCtx) => EventPayloadInputOf<NoInfer<TEventDefinition>>;
  readonly output: (event: EventOf<NoInfer<TEventDefinition>>, ctx: TCtx) => Result<TOutput, TError>;
} & CommandOutputErrDefinition<TInput, TCtx, TOutput, TError>;

export type AnyCommandDefinition =
  | RawCommandDefinition<...>
  | DefinitionBackedCommandDefinition<...>;

export function commandDefinition<T extends AnyCommandDefinition>(definition: T): T;
```

Add public event candidate/input helpers in `src/core/event.ts`:

```ts
export type EventPayloadInputOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema>
    ? z.input<TPayloadSchema>
    : never;

export type EventCandidateOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<infer TType, infer TPayloadSchema>
    ? EventRecordInput<TType, z.input<TPayloadSchema>>
    : never;
```

Then update `defineCommand(...)` overloads to consume the public descriptor types directly. No separate private shape with same meaning. Do not leave `CommandDefinition` as deprecated alias; raw factory descriptors are named `RawCommandDefinition` only.

## User-Observable Scenarios

### Scenario 1 — Public wrapper accepts definition-backed command

Given framework extension code writes:

```ts
type WrapperDefinition<T extends AnyCommandDefinition> = T;

const wrapped = commandDefinition({
  name: "bookings/create",
  inputSchema,
  outputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingCreated,
  tags: (ctx) => [`booking:${ctx.bookingId}`],
  payload: (ctx) => ({ bookingId: ctx.bookingId }),
  output: (event) => ok({ bookingId: event.payload.bookingId }),
});
```

Expected:

- TypeScript accepts descriptor without casts through `unknown`.
- `defineCommand(wrapped)` preserves input, output, error, event, and name inference.
- Runtime behavior equals direct inline `defineCommand({ ... })`.

### Scenario 2 — Wrapper composes `input`

Given wrapper adds an input pipeline step or accepts already-composed `input`, TypeScript preserves enriched `TCtx`.

Expected:

- `tags(ctx)`, `payload(ctx)`, `validate(ctx)`, and `output(event, ctx)` see composed context.
- No `Record<string, unknown>` or bare `object` escape hatch needed.

### Scenario 3 — Wrapper merges `outputErr`

Given wrapper adds or merges typed `outputErr` handlers, TypeScript preserves error union routing.

Expected:

- `outputErr` remains required when `TError` is not `never`.
- Handler ctx type remains `TCtx | TInput` as today.
- Runtime normalization uses existing `normalizeOutputErrHandlers(...)` behavior.

### Scenario 4 — Candidate payload rejects bad schema-input field

Given `Event` has payload schema with input type `string` and output type `number`, definition-backed command `payload(ctx)` must return schema input.

Expected:

- Returning stored/output payload shape fails typecheck when it differs from schema input.
- `command.event(ctx).payload` is schema input.
- `output(event, ctx).payload` is schema output.

### Scenario 5 — Runtime malformed candidate rejects before append

Given `payload(ctx)` can create malformed runtime data despite static types, pipeline validates candidate with `eventDefinition.schema` before append.

Expected:

- `SchemaError("Event validation failed", issues)` returned.
- No event appended.
- No read-model/processor fanout runs.

### Scenario 6 — Raw command path unchanged

Given raw command descriptor uses `event(ctx) => EventRecordInput`, runtime keeps current low-level interop semantics.

Expected:

- No `eventSchema` set.
- Candidate is not definition-validated.
- Existing raw command tests continue passing.

## Public Contract Delta

| Surface | Add / change | Notes |
|---|---|---|
| `src/core/event.ts` | `EventPayloadInputOf<TDefinition>` | Schema-input payload type for candidate builders. |
| `src/core/event.ts` | `EventCandidateOf<TDefinition>` | Full `{ type, tags, payload }` candidate using schema input. |
| `src/core/slice.ts` | `RawCommandDefinition` | Canonical public descriptor for raw event factory commands. |
| `src/core/slice.ts` | `DefinitionBackedCommandDefinition` | Canonical public descriptor for `EventDefinition`-backed commands. |
| `src/core/slice.ts` | `AnyCommandDefinition` | Public union for wrappers/helpers. |
| `src/core/slice.ts` | `commandDefinition(...)` | Identity builder for reusable wrappers and inference anchoring. |
| `src/core/slice.ts` | `CommandDefinition` | Remove/rename. It must not remain as compatibility alias or deprecated public name. |
| `src/index.ts` | root exports for all new public types/helpers | Required for extensions using package root import. |
| `llms.txt` | update command DSL docs | Document public descriptor names and candidate/output distinction. |

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Raw command descriptor typing | `src/core/slice.ts` `CommandDefinition`; root export | `RawCommandDefinition` | ambiguous public name | medium: wrappers assume it means all commands | remove `CommandDefinition`; use `RawCommandDefinition` only. |
| Definition-backed descriptor typing | private `EventDefinitionCommandDefinition`; overloads | `DefinitionBackedCommandDefinition` public type | private/public split | high: extensions copy internals or cast | promote to public, make overloads consume it. |
| Event candidate payload input vs output event payload | private `CommandEventCandidate`, `DefinitionBackedCommandPayloadInput`; `EventOf`, `EventPayloadOf` | `src/core/event.ts` helper types | scattered derived helpers | high: easy to erase transform schemas | move public candidate/input helpers to event module, use in slice. |
| Runtime event candidate validation | `defineCommand(...)` event-backed branch; `pipeline.ts` event parse | existing command pipeline | intentional layered checks | high if wrappers force raw path | preserve definition-backed branch and `eventSchema = eventDefinition.schema`. |
| Wrapper identity/inference | no public helper | `commandDefinition(...)` | missing owner | medium: ad hoc wrappers duplicate constraints | add identity helper as public inference anchor. |

## Validation Contract

| Boundary | Input | Parser / checker | Success | Failure |
|---|---|---|---|---|
| `commandDefinition(definition)` | app module descriptor | TypeScript only | returns same descriptor identity | compile-time errors only; no runtime validation added. |
| `defineCommand(rawDescriptor)` | raw descriptor | existing input/output schemas; no event schema | same command shape as today | same failures as today. |
| `defineCommand(definitionBackedDescriptor)` | definition-backed descriptor | existing input/output schemas plus `eventDefinition.schema` before append | parsed event appended; `output` receives `EventOf<typeof Event>` | malformed candidate returns existing `SchemaError("Event validation failed", issues)`. |
| root exports | library import surface | TypeScript module resolution | extensions import public types | missing export is regression. |

## Non-Goals

- No new command runtime semantics.
- No migration of stored events.
- No conversion of definition-backed commands into raw event factories.
- No public in-process typed app client.
- No broad command/query descriptor abstraction beyond command definitions in this issue.
- No weakening of cast policy; any implementation cast must stay local to existing overload normalization boundary.

## Verification Contract

Type-level tests in `src/__tests__/type-check.ts`:

- Public wrapper accepts `DefinitionBackedCommandDefinition`.
- Wrapper composes `input` and exposes enriched ctx to `tags`, `payload`, `validate`, and `output`.
- Wrapper merges or forwards `outputErr` while preserving error handler typing.
- Bad payload field fails typecheck for definition-backed command.
- Transform payload command proves `payload(...)` and direct `command.event(ctx)` use schema input.
- `output(event, ctx)` sees `EventOf<typeof Event>` / schema output.
- Root exports allow import of new public descriptor and event helper types.

Runtime tests in `src/__tests__/pipeline-wiring.test.ts` or focused core test:

- Malformed definition-backed event candidate is rejected by `eventSchema` before append.
- Raw-event command path remains unchanged and unvalidated by event definitions.
- `commandDefinition(...)` is identity at runtime.

Full gates after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

## Rollout / Docs

- Update `llms.txt` because public DSL behavior and canonical examples change.
- Mention no `llms.txt` change only if implementation proves public docs already cover all new names, unlikely here.
- Document intentional public type break: `CommandDefinition` removed; use `RawCommandDefinition` or `DefinitionBackedCommandDefinition`.

## Implementation Handoff Notes

Planning should turn this into small slices:

1. Add public event helper types and export them.
2. Rename raw descriptor type to `RawCommandDefinition`, remove `CommandDefinition`, add public definition-backed descriptor and union, update overloads to use them.
3. Add `commandDefinition(...)` identity helper and root exports.
4. Add type/runtime regression coverage and `llms.txt` updates.

Next step: implementation plan artifact, not code yet.
