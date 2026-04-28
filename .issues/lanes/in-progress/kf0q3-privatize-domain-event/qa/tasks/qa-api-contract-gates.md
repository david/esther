# Public event API contract automated verification

status: pending
role: agent
browser_session: none
device: desktop
depends_on:
  - none
mode: auto-cli
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - typecheck public root exports and event DSL type contracts
    - lint architecture/import boundary cleanup
    - run full runtime test suite for event-store, reducer, projector, processor regressions
  covered:
    - bun run typecheck
    - bun run lint
    - bun run test
  missing:
    - none

## Goal
Verify the `DomainEvent` root export removal, `EventRecordInput` low-level replacement, and unchanged event runtime behavior using documented repository commands.

## Setup Notes
- Use repository checkout for issue `kf0q3-privatize-domain-event` after implementation tasks 01, 02, and 03.
- No browser, server, database fixture, or manual account is required.
- Expected source state:
  - root `DomainEvent` is unavailable;
  - root `EventRecordInput` is available for low-level `EventStore.append` usage;
  - app-like tests use `defineEvent(...)` plus `EventOf<typeof Definition>`;
  - `llms.txt` no longer recommends `DomainEvent` for app event authoring.
- Output artifacts to inspect: terminal output for the three commands.

## Start
- URL: none
- Page: repository shell
- Device: desktop

## Steps
1. Page: repository shell
   Locate: project root prompt at `.issues/lanes/in-progress/kf0q3-privatize-domain-event` checkout
   Action: run `bun run typecheck`
   Expect: `tsgo --noEmit -p tsconfig.json` completes with no TypeScript errors, including the intentional `@ts-expect-error` assertion for removed root `DomainEvent`.
2. Page: repository shell
   Locate: project root prompt
   Action: run `bun run lint`
   Expect: ESLint completes with `--max-warnings=0` and dependency-cruiser reports no dependency violations.
3. Page: repository shell
   Locate: project root prompt
   Action: run `bun run test`
   Expect: Bun test suite passes with no failed tests.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Removed app-facing raw event type | `src/__tests__/type-check.ts` via `bun run typecheck` | implemented task 03 | root `DomainEvent` access fails only where covered by `@ts-expect-error`; command exits 0 | proves public API removal is enforced |
| Low-level replacement type | `src/__tests__/type-check.ts` via `bun run typecheck` | implemented task 01/03 | root `EventRecordInput` compiles for custom `EventStore.append` usage | store/adapter interop remains nameable |
| Import and dependency boundaries | `bun run lint` | implemented rename/guidance cleanup | no ESLint warnings/errors and no dependency-cruiser violations | protects architecture boundary rules |
| Runtime behavior unchanged | `bun run test` | existing adapter and pipeline test suite | all tests pass; no event-store, reducer, projector, processor regression | persisted wire shape remains `{ type, tags, payload }` by covered tests |
| Tool guidance updated | `llms.txt` coverage plus review artifact | implemented task 03 | no app-facing `DomainEvent` recommendation; `EventRecordInput` scoped to low-level interop | review found no actionable finding |

## Pass Criteria
- `bun run typecheck`, `bun run lint`, and `bun run test` all exit 0 in the final issue checkout.
- No command output reports stale `DomainEvent` root export availability, architecture violation, or failing runtime tests.

## Failure Capture
- failing step number
- exact command
- expected result
- actual result
- full terminal output or saved log path
- current commit SHA
- `git status --short`
