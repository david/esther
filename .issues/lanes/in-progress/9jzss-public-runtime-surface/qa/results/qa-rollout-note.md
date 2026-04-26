# QA Results — qa-rollout-note

## Verdict
passed

## Evidence

### Step 1 — removed export list present
Command:
```bash
rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|Step|StepError|InlineResult" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md
```

Output included all removed root export names on lines 13–24:
- `executeCommand`
- `executeQuery`
- `createReadInterpreter`
- `ReadInterpreter`
- `ReadInterpreterDeps`
- `ProjectionStore`
- `SliceDeps`
- `CompileDeps`
- `CompiledOperation`
- `Step`
- `StepError`
- `InlineResult`

### Step 2 — supported alternatives present
Command:
```bash
rg -n "createApp\\(\\)\\.dispatch|input adapters|read-interpreter and projection-store wiring|BoundaryObservation|BoundaryObservationError" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md
```

Output included:
```text
28:- Use `createApp().dispatch(sliceName, input)` or input adapters instead of importing `executeCommand` or `executeQuery` from the package root.
29:- Let `createApp()` own read-interpreter and projection-store wiring instead of constructing `createReadInterpreter`, `ReadInterpreter`, or `ProjectionStore` directly from the root API.
30:- Use the public error/detail contracts `BoundaryObservation` and `BoundaryObservationError` instead of naming `SliceDeps` for public error or DCB boundary-observation handling.
36:- `BoundaryObservation` and `BoundaryObservationError` remain root-public because they are observable error/detail contracts.
```

### Step 3 — forbidden subpaths absent
Command:
```bash
rg -n "esther/(unstable|internal|adapter-kit)|unstable subpath|internal subpath|adapter-kit" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md || true
```

Observed output: none.

## Pass Criteria
- Rollout note names every removed root export: met.
- Rollout note gives all three supported alternatives from the plan: met.
- Forbidden subpath search returns no matches: met.
