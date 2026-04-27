# Review Finding 01 — Fastify route parser contract unclear

Date: 2026-04-27
Source review: `review/diff/01-review-diff.md`

## Finding

`llms.txt` now shows a typed Fastify route mapper using:

```ts
input: ({ body }) => placeOrderInputSchema.parse(body),
```

`createFastifyInputAdapter` calls `route.input(routeRequest)` before dispatch. The adapter's default HTTP error mapping only handles `Result` errors returned from dispatch. A thrown Zod parse error in `route.input` is not converted to Esther `SchemaError` / HTTP 400 by `sendDefaultResult`.

## Risk

Medium.

Docs are boundary-facing and likely copied. Invalid HTTP input can follow Fastify host error handling rather than the documented Esther error mapping. This may conflict with nearby docs saying Fastify maps `SchemaError` to 400.

## Evidence

- `llms.txt` Fastify snippet uses `placeOrderInputSchema.parse(body)` inside route `input`.
- `src/adapters/fastify/input.ts` route handler:
  - calls `const input = route.input(routeRequest);`
  - then calls `const result = await boundDispatch(route.slice, input);`
  - only `sendDefaultResult(reply, result)` maps `_tag: "SchemaError"` to 400.
- No try/catch around route `input` maps thrown parser errors to `SchemaError`.

## Suggested fix

Clarify or change Fastify docs so generated code does not assume thrown route-input validation is handled by Esther's default result mapper.

Acceptable fixes:

1. Prefer non-throwing route input examples that let app `inputSchema` validation produce `SchemaError` through dispatch, with any necessary type note.
2. Or keep parser example but add explicit warning: route `input` parsers run before app dispatch; thrown errors are host/Fastify error-handler responsibility, not Esther `SliceError` mapping.
3. Or change adapter behavior in source to catch route-input validation errors and map them intentionally, then add tests and docs. This is larger than docs-only scope.

## Acceptance check

- `llms.txt` no longer implies `placeOrderInputSchema.parse(body)` errors become Esther `SchemaError` 400 unless source actually implements that.
- Fastify docs still show typed route binding and preserve host-owned auth note.
