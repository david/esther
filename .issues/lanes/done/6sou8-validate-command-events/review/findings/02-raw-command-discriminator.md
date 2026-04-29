# Review Finding 02 — Raw command discriminator can misclassify extra-property definitions

Status: open
Source review: `review/diff/02-review-diff.md`
Risk: high
Confidence: high for code path, medium for caller prevalence

## Finding

`defineCommand` runtime chooses the definition-backed event path when both `"tags" in definition` and `"payload" in definition` are true.

Raw `CommandDefinition` remains structurally typed. A caller can pass a reusable raw command definition object with extra helper properties named `tags` and `payload`; TypeScript still accepts it as raw command because extra properties on variables are allowed. Runtime then misclassifies it as definition-backed.

Current runtime path:

```ts
if ("tags" in definition && "payload" in definition) {
  const eventDefinition = definition.event;
  eventFn = (ctx) => ({
    type: eventDefinition.type,
    tags: [...definition.tags(ctx)],
    payload: definition.payload(ctx),
  });
  eventSchema = eventDefinition.schema;
}
```

For a raw command, `definition.event` is a function. `eventDefinition.type` and `eventDefinition.schema` are therefore not an `EventDefinition` contract. This can ignore raw `event(ctx)` and append malformed events such as `{ type: undefined, ... }` with no event-schema validation.

## Why it matters

- Raw command path is deliberate public interop escape hatch.
- Public TypeScript types still accept raw command definitions structurally.
- Misclassification can change stored event type/payload/tags at append time.
- Stored malformed events are replay-sensitive and can break reducers/projectors/processors later.

## Evidence

- `src/core/slice.ts`: definition-backed branch checks helper-field presence, not `definition.event` shape.
- `src/core/slice.ts`: raw `CommandDefinition` has `event: (ctx) => TEvent`; event-definition form has `event: EventDefinition` plus `tags`/`payload`.
- TypeScript structural typing permits extra properties on non-inline variables passed to `defineCommand`.
- No current test pins raw command behavior when extra `tags`/`payload` fields exist.

## Suggested fix

- Add a regression test for a raw command definition object with extra helper fields named `tags` and `payload`; dispatch should append exactly the raw `event(ctx)` result.
- Change runtime discriminator to inspect `definition.event` shape instead of helper-field presence, e.g. definition-backed only when `definition.event` is an `EventDefinition` object/non-function with expected fields.
- Keep raw path selected whenever `definition.event` is a function, even if the definition object has extra fields.

## Acceptance

- Raw command definition with extra `tags`/`payload` fields still uses raw `event(ctx)`.
- Definition-backed commands still construct candidates from `EventDefinition.type`, `tags(ctx)`, and `payload(ctx)`.
- Existing definition-backed validation, transform-schema, and raw interop tests still pass.
