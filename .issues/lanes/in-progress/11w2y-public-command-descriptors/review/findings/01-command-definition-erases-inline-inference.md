# Finding 01 — `commandDefinition` erases inline inference

Status: actionable
Severity: high
Category: public TypeScript API / boundary contract

## Problem

`commandDefinition(...)` is meant to be public identity/inference anchor for reusable command descriptor wrappers. Current `AnyCommandDefinition` is implemented as broad structural helper types using `never` callback contexts and `unknown` payload/output types.

That weakens inline definition-backed descriptors:

- unannotated `tags(ctx)`, `payload(ctx)`, and `output(event, ctx)` callbacks see `ctx` / `event` as `never`;
- bad payload fields can be accepted by `commandDefinition(...)`;
- `defineCommand(commandDefinition(badDescriptor))` can also pass typecheck, so schema-input candidate mistakes escape compile-time checking.

This violates acceptance intent: wrappers should preserve `input`, `outputErr`, candidate payload input, and parsed output event typing without casts or copied private shapes.

## Evidence

Current implementation:

- `src/core/slice.ts` defines `AnyRawCommandDefinition` / `AnyDefinitionBackedCommandDefinition` with callback contexts as `never` and payload/output as `unknown`.
- `commandDefinition<T extends AnyCommandDefinition>(definition: T): T` contextually types inline object literals against that broad union.
- Existing positive tests mostly pass already annotated `DefinitionBackedCommandDefinition` values, so they do not test inline inference.

Temporary review probe showed this should error but did not:

```ts
const bad = commandDefinition({
  name: "bad",
  inputSchema: S,
  outputSchema: S,
  input: compose<{}>(),
  validate: [],
  event: E,
  tags: (_ctx: {}) => [],
  payload: (_ctx: {}) => ({ bad: "x" }),
  output: (event, _ctx: {}) => ok({}),
});

// expected compile error; current typecheck accepts
const cmd = defineCommand(bad);
```

Temporary review probe also showed inline inference failure:

```ts
const def = commandDefinition({
  input: compose<Input>(),
  event: E,
  tags: (ctx) => [ctx.good],       // ctx is never
  payload: (ctx) => ({ good: ctx.good }),
  output: (event, ctx) => ok({ good: event.payload.good + ctx.good }), // event/ctx are never
});
```

## Expected Behavior

Inline definition-backed descriptor through `commandDefinition({...})` should behave like inline `defineCommand({...})` for types:

- `ctx` in `tags`, `payload`, `validate`, and `output` follows `input` pipeline context.
- `payload(ctx)` returns `EventPayloadInputOf<typeof Event>`.
- `output(event, ctx)` sees `EventOf<typeof Event>`.
- Bad payload field/type fails typecheck even if descriptor is wrapped with `commandDefinition` before `defineCommand`.

## Risk

High.

This is new public API. If shipped this way, extension authors may copy shapes or add casts again, or worse, wrap descriptors with `commandDefinition` and lose compile-time protection for transformed/input candidate payloads.

Runtime validation still rejects malformed candidates before append, so stored events are protected. Risk is public DSL type-safety and caller migration breakage, not persistence corruption.

## Candidate Fix

Prefer one of:

1. Make `AnyCommandDefinition` a real generic union over `RawCommandDefinition<...>` and `DefinitionBackedCommandDefinition<...>` that preserves relationships; or
2. Add overloads for `commandDefinition(...)` mirroring `defineCommand(...)` descriptor overloads, returning the exact descriptor type; keep broad internal helper private only if needed for implementation; or
3. Introduce internal helper aliases for inference, but keep public `AnyCommandDefinition` strong enough for wrappers and inline object literals.

Avoid public `never` / `unknown` callback erasure for descriptor fields.

## Required Tests

Add type-level tests in `src/__tests__/type-check.ts`:

- `commandDefinition({ ...definition-backed inline... })` infers `ctx` from composed `input` and `event` as `EventOf<typeof Event>` in `output`.
- `defineCommand(commandDefinition({ ...bad payload field... }))` fails typecheck.
- Transform payload event through `commandDefinition` keeps direct `command.event(ctx).payload` as schema input and `output(event).payload` as schema output.
- Wrapper `function wrap<T extends AnyCommandDefinition>(definition: T): T` preserves a valid inline or pre-typed definition without casts.

## Suggested Handoff

{{/skill:breakdown 11w2y-public-command-descriptors --from review/findings/01-command-definition-erases-inline-inference.md}}
