# QA Results — qa-contract-evidence

status: passed
Date: 2026-04-27
Mode: agent-executable-non-browser

## Evidence

### Step 1 — targeted runtime contract tests

Command:

```bash
bun test src/core/event.test.ts src/core/read-model.test.ts src/core/processor.test.ts
```

Result: passed.

Summary:
- 45 tests passed.
- 0 failed.
- Covered generated event helper runtime contract, read-model binding with `Event.schema`, and processor binding with `Event.schema`.

### Step 2 — public type contract

Command:

```bash
bun run typecheck
```

Result: passed.

Summary:
- `tsgo --noEmit -p tsconfig.json` exited 0.
- Public package-root type coverage compiled.

### Step 3 — lint / architecture

Command:

```bash
bun run lint
```

Result: passed.

Summary:
- ESLint exited 0.
- dependency-cruiser reported `✔ no dependency violations found (55 modules, 166 dependencies cruised)`.

### Step 4 — full runtime suite

Command:

```bash
bun run test
```

Result: passed.

Summary:
- 251 tests passed.
- 0 failed.
- 619 expectations.

## Manual QA conclusion

No browser/user-executed QA remains. Issue changes library core API only, with no UI route, external service, persistence migration, or manual workflow. Approved plan and implementation tasks explicitly mark manual verification as not applicable; QA accepted automated type/runtime evidence as final non-browser verification.
