# qa-public-command-runtime Results

verdict: passed
status: passed
mode: auto-cli
runner: agent
last_run: 2026-05-01
commit: `3ba61c7c6c46a5a4d8ff8f5cb1a6b7f9f2bb546e`

## Displayed test card

QA: Public command descriptor runtime invariants pass
Runner: agent
Mode: auto-cli
User: agent / none
Device: desktop
Start: terminal `/home/david/esther-w0`

1. Run `bun run test`. Expect exit `0` with no failed tests.
2. Inspect `pipeline-wiring` failures, if any. Expect no failure mentioning `eventSchema`, malformed event candidate validation, raw command path, `commandDefinition`, `commandDefinitionWrapper`, or `mergeOutputErrHandlers`.
3. Inspect final Bun test summary. Expect zero failures.

Pass: `bun run test` exits `0`; full suite has zero failed tests.
Fail: failing test file/name, assertion/stack, command output, commit hash.

## Step checklist

✅ 1. Run `bun run test` — command exited `0`.
✅ 2. Inspect `pipeline-wiring` failures — none; relevant `pipeline-wiring` tests passed.
✅ 3. Inspect final Bun test summary — `284 pass`, `0 fail`, `716 expect() calls`, `Ran 284 tests across 21 files`.

## Commands run
- `bun run test`

## Evidence
- Exit code: `0`.
- Bun summary: `284 pass`, `0 fail`, `716 expect() calls`, `Ran 284 tests across 21 files`.
- Current git commit hash: `3ba61c7c6c46a5a4d8ff8f5cb1a6b7f9f2bb546e`.

## Workflow gaps
- none

## Missing CLI domains/actions
- none

## HTML discoverability gaps
- none — CLI-only library QA.

## Next handoff
- pending QA remains: `{{/skill:qa 11w2y-public-command-descriptors}}`
