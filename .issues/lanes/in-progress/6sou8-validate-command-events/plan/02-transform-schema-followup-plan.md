# Implementation Plan — Align transform schema command event validation

## Goal

Resolve review finding `review/findings/01-transform-schema-validation.md` by making the event-definition-backed command type contract and runtime validation contract agree when a Zod event payload schema has different `z.input` and `z.output` types.

Choose the support path: definition-backed command `payload(ctx)` should provide the schema input shape, the pipeline should validate/parse the constructed event with `EventDefinition.schema`, and the parsed output event should be appended and passed to `output(event, ctx)`.

## Non-goals

- Do not remove or validate the raw `event(ctx) => EventRecordInput` command path.
- Do not change `EventPayloadOf<TDefinition>` or `EventOf<TDefinition>`; they continue to represent stored/output event payload shape via `z.output<TPayloadSchema>`.
- Do not make `EventDefinition.create(...)` parse payloads.
- Do not change event-store append contracts, adapter persistence formats, reducer/projector schemas, or replay behavior.
- Do not add a new typed app dispatch/client layer.

## Source artifacts

- `description.md`
- `plan/01-implementation-plan.md`
- `plan/checks/01-plan-sanity.md`
- `impl/checkpoints/02.md`
- `review/diff/01-review-diff.md`
- `review/findings/01-transform-schema-validation.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/domain-language.md`
- `doc/commands.md`
- `src/core/event.ts`
- `src/core/slice.ts`
- `src/core/pipeline.ts`
- `src/__tests__/type-check.ts`
- `src/__tests__/pipeline-wiring.test.ts`
- `llms.txt`

## Current-state summary

- `defineEvent(...)` stores the payload schema and exposes `schema`, `payloadSchema`, and `create({ tags, payload })`.
- `EventPayloadOf<TDefinition>` is `z.output<TPayloadSchema>`.
- `EventOf<TDefinition>` is `EventRecordInput<TType, z.output<TPayloadSchema>>`.
- Current definition-backed `defineCommand` overload types `payload(ctx)` as `EventPayloadOf<TEventDefinition>`.
- Current runtime builds an output-shaped event with `EventDefinition.create(...)`, then calls `EventDefinition.schema.safeParse(event)` before append.
- For transform schemas such as `z.string().transform((value) => value.length)`, the command must return `number`, but `safeParse` expects `string` input, so a type-valid command fails pre-append validation.

## Behavior changes

| Surface | Current | Proposed |
|---|---|---|
| Definition-backed command `payload(ctx)` type | `z.output<TPayloadSchema>` | `z.input<TPayloadSchema>` |
| Definition-backed command event construction | `EventDefinition.create({ tags, payload })` before parse | construct schema-input event `{ type, tags, payload }` before parse; append parsed event |
| `output(event, ctx)` type/value | `EventOf<TDefinition>` and parsed event for object schemas | same; value is parsed `z.output` event, including transforms |
| Raw command path | unvalidated by event definitions | same |
| `EventDefinition.create(...)` | accepts `z.output`, no parse | same |
| Transform payload schemas | can typecheck then fail runtime | typecheck against schema input; parse to schema output before append |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| User-defined events emitted through definition-backed commands | unchanged stored event shape | `defineCommand` event-definition-backed form | reducers, projectors, processors receive parsed output event | same stored output shape; command builder input may differ before parse | `~payload(ctx)` typed as schema input, parsed to output before append | replay-safe, no migration |
| Raw command events | unchanged | existing `event(ctx) => EventRecordInput` | same | same | same | same |

Detailed shape stays:

```ts
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

For a transforming payload schema:

```ts
const Transformed = defineEvent({
  type: "Transformed",
  payload: z.string().transform((value) => value.length),
});

// Command payload input: string
payload: () => "abc";

// Appended/output event payload: number
{ type: "Transformed", tags: [...], payload: 3 }
```

No historical event names, versions, serialized fields, or consumer event schemas change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineCommand` definition-backed `payload(ctx)` | public TS DSL | `src/core/slice.ts` | slice authors, type-check suite, `llms.txt` readers | same | same | `~payload` from `z.output` to `z.input` | same event schema parse |
| `output(event, ctx)` for definition-backed commands | public TS DSL/runtime callback | `src/core/slice.ts` + `src/core/pipeline.ts` | slice authors | same | same | same type, but plan explicitly guarantees parsed output after transforms | same |
| `EventDefinition.create(...)` | public TS helper | `src/core/event.ts` | slice authors and raw helper users | same | same | same | same |
| Runtime failure | dispatch result | `src/core/pipeline.ts` | adapters and callers of `dispatch` | same | same | same `SchemaError("Event validation failed", issues)` | same |
| Documentation guidance | public docs/LLM context | `llms.txt`, `doc/domain-language.md` if needed | users and agents | transform guidance | stale `z.output` command payload wording | `~payload` wording to schema input for command builder | same |

Proposed internal command helper type:

```ts
type EventDefinitionCommandPayloadInput<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema> ? z.input<TPayloadSchema> : never;
```

Proposed event builder shape for definition-backed commands:

```ts
// before parse; not appended directly
{
  type: eventDefinition.type,
  tags: [...definition.tags(ctx)],
  payload: definition.payload(ctx), // z.input<TPayloadSchema>
}
```

The parsed result of `eventDefinition.schema.safeParse(...)` is still `EventOf<TDefinition>` and is the only event value appended and passed to `output`.

## Persistence / migrations / replay

No persistence schema change. Stored event records remain `{ type, tags, payload, id, position, timestamp }`.

No migration or backfill. Existing persisted events are not revalidated and do not need transformation.

Replay impact: none. Reducers, read models, processors, and event schemas already consume stored/output event shapes. The change only affects the pre-append builder type for new definition-backed command dispatch.

## Read models / queries

No read-model DSL or query behavior change.

Read-model event bindings continue to receive only appended parsed events. For transform payload schemas, projectors receive the transformed `z.output` payload, not the command builder's `z.input` payload.

## Security / authorization

Not applicable. Change affects schema input/output alignment for event validation, not auth, roles, visibility, signer/public access, or denial semantics.

## Frontend state / UX

No frontend code. Dynamic `app.dispatch(sliceName, input)` result shape is unchanged. Transport adapters still receive `Err(SchemaError)` for malformed definition-backed events.

## Side effects / processors / external integrations

Processors/effects stay downstream of successful append.

- Parse success: parsed output event appends, projectors/processors/effects see output payload.
- Parse failure: append is skipped, and no projectors/processors/effects run.

No external integration contracts change.

## Critical invariants / observability

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| Definition-backed command appends only events accepted by `EventDefinition.schema` | protects stored event integrity | pipeline `safeParse(event)` before append | same, but parse input-shaped payload and append parsed output | malformed event could poison event log |
| Type contract matches runtime validation contract | avoids commands that typecheck but always fail | violated for `z.input != z.output` schemas | `payload(ctx)` typed as `z.input`, `output(event)` typed as `z.output` | false confidence in public DSL |
| Raw interop remains deliberately lower-level | preserves escape hatch and backward compatibility | raw path has no event schema | same | breaking existing interop callers |
| Downstream work happens only after append | prevents side effects from rejected events | validation before append | same | projectors/processors/effects could observe rejected event |

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Type-level guard | `bun run typecheck` over `src/__tests__/type-check.ts` | covers object payload mismatch | add transform input/output compile checks | implementers/reviewers |
| Runtime guard | `bun test src/__tests__/pipeline-wiring.test.ts` | covers malformed object payload + zero downstream work | add transform schema success regression | implementers/reviewers |
| Full gates | `bun run typecheck`, `bun run lint`, `bun run test` | required | same | maintainers |

No new logs or metrics required; existing test/gate signals are sufficient for this library-level contract fix.

## Testing contract

Add/update tests:

1. `src/__tests__/type-check.ts`
   - event payload schema where `z.input` differs from `z.output`, e.g. `z.string().transform((value) => value.length)`.
   - definition-backed command `payload(ctx)` returning schema input (`string`) typechecks.
   - `output(event)` sees `event.payload` as schema output (`number`).
   - `payload(ctx)` returning schema output (`number`) fails with `@ts-expect-error` for that transform schema.
   - existing object-schema wrong payload and wrong tags tests still pass.

2. `src/__tests__/pipeline-wiring.test.ts`
   - definition-backed command with transform payload returns input payload (`string`) and dispatch succeeds.
   - appended event stores transformed payload (`number`).
   - `output(event)` receives transformed payload (`number`).
   - malformed transform input still returns `SchemaError("Event validation failed", issues)` before append, with no downstream work if covered in existing malformed test or a compact transform-specific assertion.

3. Documentation checks
   - Update `llms.txt` command DSL text: command `payload(ctx)` for definition-backed commands is schema input; appended/output event payload is schema output after parse.
   - Update `doc/domain-language.md` only if current command wording would be misleading about input/output transform behavior.

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

- Public API was newly introduced in this issue; fix before merge to avoid shipping a contradictory contract.
- No migrations, replay jobs, or adapter deploy ordering.
- Documentation must be updated with the chosen transform-support contract.
- `llms.txt` must change because public DSL behavior and guidance change.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Type change breaks object-schema command examples | For normal object schemas, `z.input` and `z.output` are the same; type-check existing examples |
| `EventDefinition.create(...)` cannot accept input-shaped payload | Do not use `create(...)` for pre-parse command event construction; keep `create(...)` unchanged for output-shaped helper use |
| Cast pressure in overload normalization increases | Keep any cast local to command normalization; document per `doc/code-style.md` |
| Output callback receives unparsed input event by mistake | Runtime test must assert transformed output payload reaches `output` and storage |
| Docs imply `EventPayloadOf` is command payload type | Update docs to distinguish command payload input from `EventPayloadOf` stored/output payload |

## Acceptance criteria

- Review finding `01-transform-schema-validation.md` is resolved by supporting transform schemas.
- Definition-backed command `payload(ctx)` is typed as event payload schema input.
- Definition-backed command `output(event, ctx)` still receives `EventOf<TDefinition>` with schema output payload.
- Runtime appends the parsed output event from `EventDefinition.schema.safeParse(...)`.
- Transform-schema command test proves input payload transforms to stored/output payload.
- Malformed definition-backed events still return `SchemaError` before append and run no downstream work.
- Raw command path remains unvalidated and compatible.
- `llms.txt` updated; `doc/domain-language.md` updated if needed.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking. This plan chooses transform-schema support rather than documentation-only prohibition.

## Implementation notes

- Main code likely stays in `src/core/slice.ts`; pipeline already appends parsed event and may need only input-typed event construction.
- Consider adding a non-exported helper type near `EventDefinitionCommandDefinition` for `z.input<TPayloadSchema>` extraction.
- Keep `EventPayloadOf` semantics unchanged because it describes stored/output payload shape and existing docs/examples use it that way.
- Avoid `Record<string, unknown>` and bare `object` in any new helper types.
- Implementation checkpoint should explicitly state how `z.input` vs `z.output` is handled and why `EventDefinition.create(...)` remains no-parse.

## Next handoff

Use `{{/skill:plan-check 6sou8-validate-command-events --plan plan/02-transform-schema-followup-plan.md}}`.
