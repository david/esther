# Implementation Plan — Align transform schema command event contract

supersedes: plan/02-transform-schema-followup-plan.md

## Goal

Resolve `review/findings/01-transform-schema-validation.md` and `plan/checks/02-revised-plan-sanity.md` by making definition-backed command event typing, runtime validation, and exported `Command.event(ctx)` contract agree for Zod payload schemas where `z.input<TPayloadSchema>` differs from `z.output<TPayloadSchema>`.

Chosen contract: definition-backed command `payload(ctx)` returns schema input, `Command.event(ctx)` returns a pre-parse event candidate, the dispatch pipeline parses that candidate with `EventDefinition.schema`, and only the parsed output event is appended and passed to `output(event, ctx)`.

## Non-goals

- Do not remove the raw `event(ctx) => EventRecordInput` command path.
- Do not validate raw command events against event definitions.
- Do not change `EventPayloadOf<TDefinition>` or `EventOf<TDefinition>`; they still describe stored/output event payload shape via `z.output<TPayloadSchema>`.
- Do not make `EventDefinition.create(...)` parse payloads.
- Do not change event-store append contracts, adapter persistence formats, reducer/projector schemas, or replay behavior.
- Do not add typed app dispatch/client layer.

## Source artifacts

- description.md
- plan/01-implementation-plan.md
- plan/02-transform-schema-followup-plan.md
- plan/checks/01-plan-sanity.md
- plan/checks/02-revised-plan-sanity.md
- impl/checkpoints/02.md
- review/diff/01-review-diff.md
- review/findings/01-transform-schema-validation.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/domain-language.md
- doc/commands.md
- src/core/event.ts
- src/core/slice.ts
- src/core/pipeline.ts
- src/index.ts
- src/__tests__/type-check.ts
- llms.txt

## Current-state summary

- `defineEvent(...)` exposes `payloadSchema`, full event `schema`, and no-parse `create({ tags, payload })` helper.
- `EventPayloadOf<TDefinition>` is `z.output<TPayloadSchema>`.
- `EventOf<TDefinition>` is `EventRecordInput<TType, z.output<TPayloadSchema>>`.
- Current definition-backed `defineCommand` overload types `payload(ctx)` as `EventPayloadOf<TDefinition>`.
- Current `Command<T...>` has one event generic used by both `event(ctx)` and `output(event, ctx)`.
- Current `Command.event(ctx)` is exported and directly callable; type-check asserts definition-backed `.event(ctx)` returns `EventOf<typeof BookingConfirmedEvent>`.
- Current runtime validates `slice.event(ctx)` with `slice.eventSchema.safeParse(event)` and appends parsed result.
- For transform schemas, the command must return output payload today, but `safeParse` expects input payload, so a type-valid command can fail before append.

## Behavior changes

| Surface | Current | Proposed |
|---|---|---|
| Definition-backed command `payload(ctx)` type | `z.output<TPayloadSchema>` | `z.input<TPayloadSchema>` |
| Definition-backed `Command.event(ctx)` | typed as stored/output event | typed and documented as pre-parse event candidate with schema-input payload |
| Raw `Command.event(ctx)` | raw append event | same; candidate and stored event types are identical |
| Dispatch append value | parsed event when `eventSchema` exists | same; parsed output event is only append value |
| `output(event, ctx)` | typed as `EventOf<TDefinition>` | same; receives parsed output event |
| `EventDefinition.create(...)` | accepts output payload, no parse | same; not used for definition-backed pre-parse command candidate |

## Decision vocabulary / intent map

| Intent handle | Meaning | Expected code seam |
|---|---|---|
| `CommandEventCandidate` | event object produced from command context before optional schema parse | `Command` second event-shape generic or equivalent internal/public type |
| `DefinitionBackedCommandPayloadInput` | payload builder return type for event-definition-backed commands | non-exported helper using `z.input<TPayloadSchema>` |
| `ParsedCommandEvent` | event accepted by `EventDefinition.schema`; storage/output shape | existing `EventOf<TDefinition>` / pipeline parse result |
| `RawInteropEvent` | raw command event path with no event-definition validation | existing raw `CommandDefinition` path |

Behavior concentration scan:

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Definition-backed event schema validation | `defineEvent` owns schema; `executeCommand` validates | pipeline uses event definition schema | intentional layered checks | medium | preserve; align types around pipeline parse |
| Transform input/output contract | `src/core/event.ts`, `src/core/slice.ts`, `src/core/pipeline.ts`, docs/tests | `defineCommand` overload + `Command` type | scattered contract wording | medium | consolidate via named candidate-vs-parsed event types |
| Raw interop unvalidated path | `CommandDefinition`, pipeline branch with no `eventSchema` | raw command API | intentional escape hatch | low | preserve |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| User-defined events emitted through definition-backed commands | unchanged stored event shape | `defineCommand` definition-backed form | reducers, projectors, processors receive parsed output event | command candidate `~payload` may be schema input; stored payload same output shape | `~payload(ctx)` typed as schema input; parsed to output before append | replay-safe, no migration |
| Raw command events | unchanged | existing `event(ctx) => EventRecordInput` | same | same | same | same |

Stored event shape stays:

```ts
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

Transform example:

```ts
const Transformed = defineEvent({
  type: "Transformed",
  payload: z.string().transform((value) => value.length),
});

const command = defineCommand({
  // ...
  event: Transformed,
  tags: () => ["transformed"],
  payload: () => "abc", // schema input
  output: (event) => ok({ length: event.payload }), // schema output: number
});

// pre-parse event candidate, not stored guarantee
command.event(ctx).payload; // string

// dispatch appends/passes parsed event
// { type: "Transformed", tags: ["transformed"], payload: 3 }
```

No historical event names, versions, serialized fields, or consumer event schemas change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineCommand` definition-backed `payload(ctx)` | public TS DSL | `src/core/slice.ts` | slice authors, type-check suite, docs | same | same | `~payload` from `z.output` to `z.input` | same event schema parse |
| Exported `Command.event(ctx)` | public TS command object | `src/core/slice.ts` | direct `Command` consumers, type-check suite | candidate/stored type distinction | same method stays | `~event` means pre-parse candidate for definition-backed commands | validation occurs only in dispatch |
| `output(event, ctx)` | public TS callback/runtime callback | `src/core/slice.ts` + `src/core/pipeline.ts` | slice authors | same | same | explicitly parsed output event for transforms | same |
| `EventDefinition.create(...)` | public TS helper | `src/core/event.ts` | event helper users | same | same | same; output payload helper remains no-parse | same |
| Runtime failure | dispatch result | `src/core/pipeline.ts` | adapters and callers of `dispatch` | same | same | same `SchemaError("Event validation failed", issues)` | same |
| Documentation guidance | public docs/LLM context | `llms.txt`, `doc/domain-language.md` if stale | users and agents | candidate-vs-parsed wording | stale `z.output` command payload wording | `~payload` wording to schema input for command builder | same |

Required public type direction:

```ts
type EventDefinitionPayloadInput<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema> ? z.input<TPayloadSchema> : never;

type EventDefinitionEventCandidate<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<infer TType, infer TPayloadSchema>
    ? EventRecordInput<TType, z.input<TPayloadSchema>>
    : never;
```

`Command` should model candidate and parsed/stored events separately, for example with a trailing default generic to preserve raw command compatibility:

```ts
type Command<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string },
  TName extends string = string,
  TEventCandidate extends EventRecordInput = TEvent,
> = {
  readonly event: (ctx: TCtx) => TEventCandidate;
  readonly eventSchema?: z.ZodType<TEvent> | undefined;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
  // existing fields unchanged
};
```

For raw commands, `TEventCandidate = TEvent`, so existing raw `Command.event(ctx)` behavior and type stay unchanged.

For definition-backed commands:

```ts
Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TDefinition>,
  TError,
  TName,
  EventDefinitionEventCandidate<TDefinition>
>
```

The implementation should not call `EventDefinition.create(...)` to build the definition-backed event candidate, because that helper accepts output payload. Instead construct the candidate directly:

```ts
{
  type: eventDefinition.type,
  tags: [...definition.tags(ctx)],
  payload: definition.payload(ctx), // z.input<TPayloadSchema>
}
```

## Validation matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| Raw command event form | parsed command input | input schema only | existing validate predicates | existing descriptors/validate | same | slice author / raw interop |
| Definition-backed command dispatch | parsed command input + command context | input schema, then `EventDefinition.schema` over event candidate | existing validate predicates plus event payload schema | existing descriptors/validate | `SchemaError("Event validation failed", issues)` before append | core pipeline |
| Direct definition-backed `Command.event(ctx)` call | typed command context | none at call site; returns candidate | none beyond caller-provided context | none | no framework result; caller receives candidate only | caller |
| `EventDefinition.create(...)` direct use | trusted caller payload | none | same | same | same | caller |

Required ordering for dispatch:

1. parse command input
2. resolve input pipeline and boundary observations
3. reject multiple boundary observations when present
4. run command validate predicates
5. build event candidate through `slice.event(ctx)`
6. if `eventSchema` exists, parse event candidate
7. append only parsed event
8. pass parsed event to `output(event, ctx)`
9. validate output schema

Event validation failure remains framework-error path and must bypass `outputErr`.

## Persistence / migrations / replay

No persistence schema change. Stored event records remain `{ type, tags, payload, id, position, timestamp }`.

No migration or backfill. Existing persisted events are not revalidated and do not need transformation.

Replay impact: none. Reducers, read models, processors, and event schemas consume stored/output event shapes. The change only affects pre-append event candidate typing and construction for new definition-backed command dispatch.

## Read models / queries

No read-model DSL or query behavior change.

Read-model event bindings continue to receive only appended parsed events. For transform payload schemas, projectors receive transformed `z.output` payload, not command builder `z.input` payload.

## Security / authorization

Not applicable. Change affects schema input/output alignment for event validation, not auth, roles, visibility, signer/public access, or denial semantics.

## Frontend state / UX

No frontend code. Dynamic `app.dispatch(sliceName, input)` result shape is unchanged. Transport adapters still receive `Err(SchemaError)` for malformed definition-backed events.

## Side effects / processors / external integrations

Processors/effects stay downstream of successful append.

- Parse success: parsed output event appends; projectors/processors/effects see output payload.
- Parse failure: append is skipped; no projectors/processors/effects run.

No external integration contracts change.

## Critical invariants / observability

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| Definition-backed dispatch appends only events accepted by `EventDefinition.schema` | protects stored event integrity | pipeline `safeParse(event)` before append | same, but parses schema-input candidate and appends parsed output | malformed event could poison event log |
| `Command.event(ctx)` type is truthful | exported `Command` is public API | currently false for transform support plan if single event generic remains | model candidate separately from parsed/stored event | direct consumers see misleading event payload type |
| `output(event, ctx)` receives stored/output event shape | slice output logic should match persisted event | current runtime uses parsed event when schema exists | preserve parsed event path | output could see pre-transform payload and diverge from storage |
| Raw interop remains lower-level | preserves escape hatch and backward compatibility | raw path has no event schema | same; candidate = stored event | breaking existing interop callers |
| Downstream work happens only after append | prevents side effects from rejected events | validation before append | same | rejected event could trigger projectors/processors/effects |

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Type-level guard | `bun run typecheck` over `src/__tests__/type-check.ts` | covers object payload mismatch and direct `.event` as output | add transform input/output/candidate checks | implementers/reviewers |
| Runtime guard | `bun test src/__tests__/pipeline-wiring.test.ts` | covers malformed object payload + no downstream work | add transform success and parsed-output assertions | implementers/reviewers |
| Full gates | `bun run typecheck`, `bun run lint`, `bun run test` | required | same | maintainers |

No new logs or metrics required; automated type/runtime gates are enough for this library-level contract.

## Testing contract

Add/update tests:

1. `src/__tests__/type-check.ts`
   - event payload schema where `z.input` differs from `z.output`, e.g. `z.string().transform((value) => value.length)`.
   - definition-backed command `payload(ctx)` returning schema input (`string`) typechecks.
   - `payload(ctx)` returning schema output (`number`) fails with `@ts-expect-error` for that transform schema.
   - `output(event)` sees `event.payload` as schema output (`number`).
   - direct definition-backed `command.event(ctx)` for transform schema returns event candidate payload input (`string`), not `EventOf<TDefinition>` output (`number`).
   - existing object-schema direct `.event(ctx)` check can remain output-shaped only because object schema input/output are identical.
   - raw command form still typechecks with `Command.event(ctx)` returning raw event.

2. `src/__tests__/pipeline-wiring.test.ts`
   - definition-backed command with transform payload returns input payload (`string`) from `payload(ctx)` and dispatch succeeds.
   - appended event stores transformed payload (`number`).
   - `output(event)` receives transformed payload (`number`).
   - malformed transform input still returns `SchemaError("Event validation failed", issues)` before append.
   - existing malformed definition-backed test continues proving no event stored and no projectors/processors/effects/output run.

3. Documentation checks
   - Update `llms.txt`: definition-backed command `payload(ctx)` returns schema input; `Command.event(ctx)` is pre-parse candidate; appended/output event payload is schema output after parse.
   - Update `doc/domain-language.md` if current command wording would imply `Command.event(ctx)` returns appended/stored event for definition-backed commands.

Full final gates:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Library DSL/runtime behavior is covered by type-level and runtime automated tests.

QA planning should remain auto-runnable using full gates above.

## Rollout / deploy notes

- Public API is additive within this issue branch; fix before merge to avoid shipping contradictory definition-backed command contract.
- Raw command `Command.event(ctx)` compatibility is preserved.
- Definition-backed direct `.event(ctx)` behavior may differ from the first implementation in this branch, but that implementation has not been merged.
- No migrations, replay jobs, or adapter deploy ordering.
- `llms.txt` must change because public DSL behavior and guidance change.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `Command` generic change breaks raw command users | Add trailing default `TEventCandidate = TEvent`; keep raw overload return shape equivalent |
| Direct `.event(ctx)` consumers expect stored event for definition-backed commands | Document candidate-vs-parsed distinction; update type-check to prevent output-shape lie |
| `EventDefinition.create(...)` accidentally used with input payload | Build definition-backed event candidate directly; keep `create(...)` unchanged for output payload helper use |
| Output callback receives unparsed input event | Runtime test must assert transformed output reaches storage and `output` |
| `eventSchema` typing cannot express input/output cleanly | Keep precise public `Command.event` candidate and `output` types; localize any schema cast in overload normalization with comment |
| Docs imply `EventPayloadOf` is command payload type | Update docs to distinguish `payload(ctx)` input from `EventPayloadOf` stored/output payload |

## Acceptance criteria

- Review finding `01-transform-schema-validation.md` is resolved by supporting transform schemas.
- Plan-check blocker is resolved: exported `Command.event(ctx)` contract is explicit and type-truthful.
- Definition-backed command `payload(ctx)` is typed as event payload schema input.
- Definition-backed `Command.event(ctx)` returns pre-parse event candidate with schema-input payload.
- Definition-backed command `output(event, ctx)` receives `EventOf<TDefinition>` with schema-output payload.
- Runtime appends only the parsed output event from `EventDefinition.schema.safeParse(...)`.
- Transform-schema command test proves input payload transforms to stored/output payload.
- Malformed definition-backed events still return `SchemaError` before append and run no downstream work.
- Raw command path remains unvalidated and compatible.
- `llms.txt` updated; `doc/domain-language.md` updated if needed.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking. This plan chooses transform-schema support and explicit candidate-vs-parsed event contract.

## Implementation notes

- Main code likely stays in `src/core/slice.ts`; pipeline already appends parsed event and may need no ordering change.
- Add a candidate event helper type near `EventDefinitionCommandDefinition`; export only if implementation/type tests prove public users need it.
- Keep `EventPayloadOf` semantics unchanged because it describes stored/output payload shape.
- Avoid `Record<string, unknown>` and bare `object` in new helper types.
- Keep casts local to overload normalization and document them per `doc/code-style.md`.
- Implementation checkpoint must state how `Command.event(ctx)`, `payload(ctx)`, parsed append, and `output(event)` relate for `z.input` vs `z.output`.

## Next handoff

Use `{{/skill:plan-check 6sou8-validate-command-events --plan plan/03-transform-schema-command-event-contract-plan.md}}`.
