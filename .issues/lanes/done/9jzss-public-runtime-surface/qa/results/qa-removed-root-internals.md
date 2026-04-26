# QA Results — qa-removed-root-internals

## Verdict
passed

## Evidence

### Step 1 — removed root internals absent from `src/index.ts`
Command:
```bash
rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|StepError|InlineResult|type Step\\b" src/index.ts || true
```

Observed output: none.

### Step 2 — negative API assertions present
Command:
```bash
rg -n "removedExecuteCommand|RemovedProjectionStore|removedSliceDeps|@ts-expect-error runtime executors|@ts-expect-error projection stores|@ts-expect-error slice dependency" src/__tests__/type-check.ts
```

Output:
```text
112:// @ts-expect-error runtime executors are internal and not root-public
113:const _removedExecuteCommand = undefined as typeof import("../index").executeCommand;
114:// @ts-expect-error projection stores are internal and not root-public
115:type _RemovedProjectionStore = import("../index").ProjectionStore;
116:// @ts-expect-error slice dependency bags are internal and not root-public
117:const _removedSliceDeps = undefined as import("../index").SliceDeps;
```

### Step 3 — typecheck passed
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
- Removed root export name search returns no matches in `src/index.ts` for runtime internals or `type Step` export: met.
- Negative assertion anchors exist for representative removed root exports: met.
- `bun run typecheck` exits 0: met.
