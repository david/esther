# QA result — Runtime descriptor read validation and effect/projection gating

Date: 2026-04-27
Status: passed
Mode: agent-executable-non-browser

## Commands run

```bash
bun run test
```

## Evidence

```text
259 pass
0 fail
639 expect() calls
Ran 259 tests across 21 files. [529.00ms]
```

Exit code: 0.

## Verified
- Direct interpreter malformed `get` and `query` row tests passed with `ReadModelSchemaError` rejection coverage.
- Processor malformed read row test passed, proving handler/effect dispatch is skipped on invalid descriptor read data.
- Read-model event malformed ctx read row test passed, proving handler/projection adapter execution is skipped on invalid descriptor read data.
- Existing query-listing and slice validation tests passed, proving shared validation helper did not regress existing projection behavior.

## Failure evidence
- none
