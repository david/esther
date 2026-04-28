# QA result — qa-public-notes

Date: 2026-04-27
Issue: `.issues/lanes/in-progress/94dtw-processor-typing`
Task: `qa-public-notes`
Status: passed
Mode: agent-executable-non-browser

## Commands

```bash
rg -n "Read-model event and processor handlers|ReadModelSchemaError|queryDescriptor|eventsByTagsDescriptor|getDescriptor" llms.txt
```

Output:

```text
15:  getDescriptor, queryDescriptor, eventsByTagsDescriptor,
219:Projection-backed command descriptors validate persisted rows before binding them. Missing rows map to `ReadModelNotFound` or the descriptor's `absent` domain error; malformed rows surface as framework `ReadModelSchemaError`.
238:`castTagQuery` binds reducer state under `key` (`ctx.accountHistory`) and subject under ``${key}Subject`` (`ctx.accountHistorySubject`). Subject-dependent logic belongs in validation or a later `derive(...)`, not inside the reducer. Absent rows map to descriptor `absent`; malformed rows surface as `ReadModelSchemaError`.
277:- `projection`: fetches a read model row. Pass `id` for direct key lookup, or `args` for a `defineReadModelQuery` model. Every returned row is schema-validated before `handle()` runs. `required: true` → fails on missing with `ReadModelNotFound`. `required: false` (default) → wraps missing as `Result<T, ReadModelNotFound>`. Malformed rows always fail with `ReadModelSchemaError`.
302:Read-model event and processor handlers can declare descriptor reads. Handler fields are inferred from descriptors: `getDescriptor(...)` -> `T | undefined`, `queryDescriptor(...)` -> `ReadonlyArray<T>`, and `eventsByTagsDescriptor(...)` -> reducer state. Read-model `get` hits and `query` rows are schema-validated before handler code runs; malformed rows throw `ReadModelSchemaError`, so projections/effects do not execute with bad data.
308:    existing: (event) => getDescriptor(orderSummaryModel, event.payload.orderId),
328:          queryDescriptor({
426:  | ReadModelSchemaError;
435:- `ReadModelSchemaError` — `{ _tag: "ReadModelSchemaError", readModelName, queryName?, issues, message }` when a persisted row exists but does not satisfy the declared read-model schema
```

## Evidence

- `llms.txt:302` states descriptor-derived handler field inference:
  - `getDescriptor(...)` -> `T | undefined`
  - `queryDescriptor(...)` -> `ReadonlyArray<T>`
  - `eventsByTagsDescriptor(...)` -> reducer state
- `llms.txt:302` states malformed read-model rows throw `ReadModelSchemaError` before projections/effects execute.
- `llms.txt:304-313` shows read-model event `reads.existing` using `getDescriptor(orderSummaryModel, event.payload.orderId)` and handler access via `ctx.existing?.customerId`.
- `llms.txt:320-337` shows processor `reads.customerOrders` using `queryDescriptor({ model: orderSummaryModel, where: { customerId: event.payload.customerId } })` and handler access via `reads.customerOrders.length`.

## Pass criteria

Passed. Public notes contain accurate descriptor read typing and validation notes plus examples for read-model event and processor reads.
