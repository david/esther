# Review Finding 01 — Transform schema event validation mismatch

Status: resolved by impl/04.md through impl/06.md
Source review: `review/diff/01-review-diff.md`
Risk: medium
Confidence: high for edge case, medium for intended support
Resolution review: `review/diff/02-review-diff.md`

## Finding

Definition-backed commands type `payload(ctx)` as `EventPayloadOf<TEventDefinition>` (`z.output<TPayloadSchema>`), then runtime validates the constructed event by passing that output-shaped event into `EventDefinition.schema.safeParse(...)`.

For Zod payload schemas where `z.input<TPayloadSchema>` differs from `z.output<TPayloadSchema>`, this can make a command typecheck but fail pre-append validation.

Example shape:

```ts
const Transformed = defineEvent({
  type: "Transformed",
  payload: z.string().transform((value) => value.length),
});

// EventPayloadOf<typeof Transformed> is number.
// New command payload(ctx) must return number.
// Transformed.schema.safeParse({ type: "Transformed", tags: [], payload: 3 }) fails,
// because the schema input expects string before transform.
```

## Why it matters

- New API is documented as preferred command emission path.
- `llms.txt` says payload is typed from `z.output` and pipeline validates full event before append.
- Checkpoint 02 says parsed event preserves Zod transform behavior if event schemas use transforms later.
- Current implementation rejects some transform-backed events before append even though TypeScript accepts them.

## Evidence

- `src/core/slice.ts`: `payload: (ctx) => EventPayloadOf<...>` and `eventDefinition.create({ payload })`.
- `src/core/event.ts`: `EventDefinition.create(...)` also accepts `z.output<TPayloadSchema>`.
- `src/core/pipeline.ts`: `slice.eventSchema.safeParse(event)` validates the already-constructed event.
- Runtime probe: `z.string().transform((s) => s.length)` rejects `3` as input even though `3` is output type.

## Suggested fix options

Pick one explicit contract:

1. Support transform schemas:
   - Make definition-backed `payload(ctx)` use `z.input<TPayloadSchema>` and append/use parsed `z.output` event, or add a schema helper that validates output shape correctly.
   - Add runtime/type tests for `z.input != z.output`.

2. Do not support transform schemas for event payloads:
   - Document event payload schemas must be storage-shape/idempotent schemas where input and output are compatible.
   - Add test/docs proving transform mismatch is rejected intentionally.

## Acceptance

- Type contract and runtime validation agree for event-definition-backed commands.
- One test covers payload schema with `z.input` different from `z.output`, or docs explicitly prohibit that schema shape for events.
- Docs/checkpoint wording no longer implies unsupported transform behavior works.
