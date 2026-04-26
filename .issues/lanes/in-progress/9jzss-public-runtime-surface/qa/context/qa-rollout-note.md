# QA Context — qa-rollout-note

## Dependency context
- Depends on `qa-removed-root-internals`: passed.

## Commands
```bash
rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|Step|StepError|InlineResult" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md
rg -n "createApp\\(\\)\\.dispatch|input adapters|read-interpreter and projection-store wiring|BoundaryObservation|BoundaryObservationError" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md
rg -n "esther/(unstable|internal|adapter-kit)|unstable subpath|internal subpath|adapter-kit" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md || true
```
