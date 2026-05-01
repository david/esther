# qa-public-command-typecheck Results

verdict: passed
status: passed
mode: auto-cli
runner: agent
last_run: 2026-05-01
commit: `3ba61c7c6c46a5a4d8ff8f5cb1a6b7f9f2bb546e`

## Displayed test card

QA: Public command descriptor type contract compiles
Runner: agent
Mode: auto-cli
User: agent / none
Device: desktop
Start: terminal `/home/david/esther-w0`

1. Run `bun run typecheck`. Expect exit `0` with no TypeScript diagnostics.
2. Inspect diagnostics for public command descriptor or event helper surfaces. Expect none for `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `DefinitionBackedCommandDefinitionWithOutputErr`, `AnyCommandDefinition`, `CommandDefinitionWrapper`, `commandDefinition`, `commandDefinitionWrapper`, `mergeOutputErrHandlers`, `EventPayloadInputOf`, or `EventCandidateOf`.
3. Inspect negative assertions. Expect no unused `@ts-expect-error` for removed `CommandDefinition`, bad payload, or wrapper `outputErr` cases.

Pass: `bun run typecheck` exits `0`; no TypeScript diagnostics.
Fail: diagnostic code/message, path/line/column, command output, commit hash.

## Step checklist

✅ 1. Run `bun run typecheck` — command exited `0`; output: `$ tsgo --noEmit -p tsconfig.json`.
✅ 2. Inspect diagnostics for public command descriptor or event helper surfaces — no TypeScript diagnostics emitted.
✅ 3. Inspect negative assertions — no unused `@ts-expect-error` diagnostics emitted.

## Commands run
- `bun run typecheck`

## Evidence
- Exit code: `0`.
- TypeScript diagnostics: none.
- Current git commit hash: `3ba61c7c6c46a5a4d8ff8f5cb1a6b7f9f2bb546e`.

## Workflow gaps
- none

## Missing CLI domains/actions
- none

## HTML discoverability gaps
- none — CLI-only library QA.

## Next handoff
- pending QA remains: `{{/skill:qa 11w2y-public-command-descriptors}}`
