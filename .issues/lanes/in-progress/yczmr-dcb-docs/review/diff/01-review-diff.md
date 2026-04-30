# Review Diff — DCB docs

## Executive Summary
- Change set is docs/workflow only: new canonical `doc/dcb.md`, short README intro, expanded DCB glossary, and mirrored `llms.txt` rules.
- Main semantic contract changed: docs now teach DCB as command-side `tagQuery(...)` / `castTagQuery(...)` observed boundary plus optimistic append guard.
- No runtime/API/event/persistence/auth/side-effect behavior changed.
- Highest risk: new canonical `doc/dcb.md` example is not TypeScript-valid without explicit `defineCommand` type parameters / context types.

## High-Risk Changes
1. **Category**: Boundary docs / canonical example
   - **Change**: `doc/dcb.md` adds primary withdraw command example for DCB.
   - **Why it matters**: Guide is new canonical teaching artifact. Acceptance criteria require snippets use current public API names and compile mentally. Extracted snippet fails TypeScript overload resolution because `defineCommand` defaults `TError` to `never` unless command generics/context are explicit.
   - **Risk**: Medium — public docs can teach invalid API usage; no runtime code affected.
   - **Confidence**: High — extracted snippet failed `tsgo` with `Type '{ type: "InsufficientFunds"; message: string; }[]' is not assignable to type 'readonly never[]'` and event-definition overload falling back to raw-event overload.
   - **Files**: `doc/dcb.md`
   - **Follow-ups**: Fix snippet with explicit `WithdrawCtx`, `WithdrawOutput`, and `defineCommand<WithdrawInput, WithdrawCtx, WithdrawOutput, typeof AccountDebited, InsufficientFunds>(...)`, or otherwise use project-supported typed pattern.

## Event Model Changes
- Added: none.
- Removed: none.
- Changed: none.
- Docs mention `AccountDebited`, `AccountCredited`, `MoneyDebited`, `MoneyCredited` as examples only; no stored/replayed event contracts changed.

## Boundary Contract Changes
- **Human docs**: `README.md` now introduces DCB early and links to `doc/dcb.md`.
- **Canonical guide**: `doc/dcb.md` defines `observedBoundary`, `appendGuard`, `decisionTags`, `projectionContext`, `futureVisibilityTags`, `singleBoundaryLimit`.
- **Glossary**: `doc/domain-language.md` DCB entry now states command-side event-history read rule, projection-read non-protection, one-boundary limit, and non-auth/non-lock caveat.
- **LLM guidance**: `llms.txt` mirrors checklist, sharp edges, unsafe patterns, and updates money transfer emitted tags to include `"account"` so future reads of `["account", account:<id>]` see debits.
- **Duplicate schema/type mirrors**: none; docs-only examples mirror semantics, not schema contracts.

## Persistence Changes
- None. No schema, migration, projector, repository, or read-model storage shape changes.

## Authorization Changes
- None. Docs explicitly say DCB is not authorization.

## Workflow / State Changes
- `.issues` item moved backlog → in-progress and implementation/checkpoint/gate artifacts added.
- No product/runtime workflow state changed.

## Intent Preservation / Semantic Handles
- Good: planned handles are visible in docs: `observedBoundary`, `appendGuard`, `decisionTags`, `projectionContext`, `futureVisibilityTags`, `singleBoundaryLimit`.
- Good: docs express business policy as tag selection questions rather than hiding it in mechanics.
- Gap: canonical code snippet currently hides/omits necessary type seam for domain errors/context, causing invalid public usage.

## Side-Effect Changes
- None. No processors/effects/integrations changed.

## Test Coverage Delta
- No test files changed, appropriate for docs-only change.
- Gate checkpoint records full repo gates passed: `bun run typecheck`, `bun run lint`, `bun run test`.
- Missing targeted verification: no doc snippet typecheck; manual extraction found `doc/dcb.md` snippet does not typecheck.

## Scattered Logic Signals
- Low risk: DCB rules now appear in `doc/dcb.md`, README, `doc/domain-language.md`, and `llms.txt`; this is intentional docs duplication.
- Center of gravity is clear: `doc/dcb.md` canonical, other files link/summarize.

## Missing Counterparts
- Likely missing counterpart: doc snippet type-check verification for `doc/dcb.md` canonical example.
- No obvious runtime, API, persistence, auth, event consumer, projector, or processor counterpart gap.

## Next Handoff
- {{/skill:breakdown yczmr-dcb-docs --from review/findings/01-dcb-guide-snippet-does-not-typecheck.md}}
