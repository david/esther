# QA results — qa-automated-api-evidence

Status: passed
Date: 2026-04-25
Mode: agent-executable-non-browser

## Commands run

```bash
git status --porcelain
cd be && bun run migrate:data:check # skipped: no be/ directory in this repo
git diff --name-status origin/main...HEAD
git diff --stat origin/main...HEAD
# automated evidence assertions against review/findings/01-gate-results.md,
# branch diff file list, plan, implementation tasks, and checkpoints
```

## Evidence

### Gate evidence
From `.issues/lanes/in-progress/i82yl-read-registration/review/findings/01-gate-results.md`:

- `bun run test`: passed — 227 tests across 18 files, 0 failures, 562 assertions.
- `bun run lint`: passed — ESLint completed with `--max-warnings=0`; dependency-cruiser reported no dependency violations across 51 modules and 141 dependencies.
- `bun run typecheck`: passed — `tsgo --noEmit -p tsconfig.json` completed successfully.
- Failures: None.

### Representative coverage in branch diff
The branch diff contains the expected automated and documentation coverage files:

- `src/__tests__/pipeline.test.ts`
- `src/__tests__/query-listing.test.ts`
- `src/__tests__/type-check.ts`
- `src/adapters/in-memory/read-model.test.ts`
- `src/adapters/postgres/read-model.test.ts`
- `doc/domain-language.md`
- `llms.txt`

### Manual QA applicability
- `plan/01-implementation-plan.md` states: “Manual QA is not applicable for this library-only app-wiring change. QA evidence should be automated.”
- `impl/01.md` through `impl/05.md` each state manual verification is not applicable for the task.
- `impl/checkpoints/01.md` through `04.md` explicitly record manual verification as not applicable.
- `impl/checkpoints/05.md` records full automated verification with typecheck, lint, and test passing.

## Result
Pass. The issue has appropriate automated QA evidence, and no manual UI/browser workflow is required.

## Failures
None.

## CLI gaps
None.
