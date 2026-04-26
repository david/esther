# QA Results — qa-root-public-positive-imports

## Verdict
passed

## Evidence

### Step 1 — supported root imports present
Command:
```bash
rg -n "BoundaryObservationError|createApp|defineCommand|defineQuery|defineReadModel|defineReadModelQuery|createInMemoryAdapter|ProjectionAdapter|OperationInput|OperationResult" src/__tests__/type-check.ts
```

Observed output included all required representative supported root-public names:
- `BoundaryObservationError`
- `createApp`
- `defineCommand`
- `defineQuery`
- `defineReadModel`
- `defineReadModelQuery`
- `createInMemoryAdapter`
- `ProjectionAdapter`
- `OperationInput`
- `OperationResult`

### Step 2 — typecheck passed
Command:
```bash
bun run typecheck
```

Output:
```text
$ tsgo --noEmit -p tsconfig.json
```

Exit code: 0

## Pass Criteria
- Representative supported root imports exist in `src/__tests__/type-check.ts`: met.
- `bun run typecheck` exits 0: met.
