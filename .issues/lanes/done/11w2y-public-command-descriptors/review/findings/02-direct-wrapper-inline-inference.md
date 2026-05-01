# Finding 02 — Direct wrapper inline descriptors lack contextual typing

Status: actionable
Severity: high
Category: public TypeScript API / boundary contract

## Problem

`commandDefinition({...})` now has descriptor-family overloads, so direct identity usage works. But extension-style wrappers that accept `T extends AnyCommandDefinition` still cannot accept inline descriptors with inferred callback types.

Current public `AnyCommandDefinition` is a broad structural union with `unknown` callback fields:

- `tags: unknown`
- `payload: unknown`
- `output: unknown`
- `event: unknown` for raw descriptors

That means a generic wrapper like this has no useful contextual type for inline callback parameters:

```ts
function wrap<T extends AnyCommandDefinition>(definition: T): T {
  return commandDefinition(definition);
}
```

Calling `wrap({ ...definition-backed descriptor... })` with unannotated `tags(ctx)`, `payload(ctx)`, and `output(event, ctx)` fails under `noImplicitAny`.

## Evidence

Temporary review probe added to `src/__tests__/type-check.ts`:

```ts
const direct = wrap({
  name: "direct-wrapped-inline-definition-backed-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx) => ["booking", `property:${ctx.propertyId}`],
  payload: (ctx) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
  }),
  output: (event, _ctx) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});

defineCommand(direct);
```

`bun run typecheck` failed:

```text
src/__tests__/type-check.ts(...): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
src/__tests__/type-check.ts(...): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
src/__tests__/type-check.ts(...): error TS7006: Parameter 'event' implicitly has an 'any' type.
src/__tests__/type-check.ts(...): error TS7006: Parameter '_ctx' implicitly has an 'any' type.
```

Probe was removed after verification.

## Expected Behavior

A public wrapper using only exported descriptor API should accept a valid inline definition-backed descriptor without casts, private shape copies, or callback annotations:

- `ctx` in `validate`, `tags`, `payload`, and `output` follows composed `input` context.
- `payload(ctx)` returns `EventPayloadInputOf<typeof Event>`.
- `output(event, ctx)` sees `EventOf<typeof Event>`.
- Wrapper returns exact descriptor type or another safe public descriptor type usable by `defineCommand`.

This is called out by `impl/05.md` acceptance:

> `T extends AnyCommandDefinition` wrapper preserves valid inline and pre-typed command descriptors without casts.

## Risk

High.

Core feature goal is extension composition. If direct wrapper calls remain broken, extension authors still need one of these bad workarounds:

- require callers to wrap with `commandDefinition({...})` before extension wrapper,
- annotate every callback parameter,
- duplicate `commandDefinition`/`defineCommand` overload shapes,
- cast through broad types.

That conflicts with issue goal: public stable typed descriptors without copying private internals or casting through `unknown`.

Runtime event storage remains safe; this is public DSL type-safety/ergonomics risk, not replay or persistence risk.

## Candidate Fix

Pick one path and cover it with direct inline wrapper tests:

1. Make `AnyCommandDefinition` a real inference-preserving generic union over `RawCommandDefinition<...>` and `DefinitionBackedCommandDefinition<...>` rather than broad `unknown` callback fields; or
2. Provide public wrapper-author helper/overload pattern that extension wrappers can reuse without copying private shapes, then document it; or
3. Reframe docs/acceptance to require callers to use `commandDefinition({...})` before custom wrappers, if direct inline wrapper inference is not feasible. This is lower-quality and should be explicit product/API decision.

Avoid leaving exported `AnyCommandDefinition` as a public type that promises wrapper inference but cannot contextually type inline callbacks.

## Required Tests

Add type-level tests in `src/__tests__/type-check.ts`:

- `function wrap<T extends AnyCommandDefinition>(definition: T): T { return commandDefinition(definition); }` accepts direct inline definition-backed descriptor with unannotated callbacks.
- Direct inline wrapper sees composed input enrichment in `validate`, `tags`, `payload`, and `output`.
- Direct inline wrapper keeps transform schema distinction: candidate payload is schema input, `output(event)` payload is parsed output.
- Direct inline wrapper bad payload field/type fails through `defineCommand(wrap({ ...bad payload... }))`.

## Suggested Handoff

{{/skill:breakdown 11w2y-public-command-descriptors --from review/findings/02-direct-wrapper-inline-inference.md}}
