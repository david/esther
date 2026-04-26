# Automated API and app-wiring evidence

status: pending
role: agent
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify that the library-only read-model registration change has complete automated QA evidence and requires no manual UI workflow.

## Setup Notes
- Issue: `.issues/lanes/in-progress/i82yl-read-registration`
- Gate evidence file: `.issues/lanes/in-progress/i82yl-read-registration/review/findings/01-gate-results.md`
- Expected full gates: `bun run test`, `bun run lint`, and `bun run typecheck` all passed.
- Expected representative coverage: canonical `readModels` runtime tests, public type-flow tests, adapter factory tests, and docs/example guidance are present in the branch diff.
- No browser, database migration, seed user, or external service setup is required.

## Start
- URL: not applicable
- Page: repository checkout at `/home/david/esther-w0`

## Steps
1. Page: terminal in `/home/david/esther-w0`
   Inspect: `.issues/lanes/in-progress/i82yl-read-registration/review/findings/01-gate-results.md`
   Action: confirm the file records passed results for `bun run test`, `bun run lint`, and `bun run typecheck`.
   Expect: each gate is listed as passed and the failures section says `None`.
2. Page: terminal in `/home/david/esther-w0`
   Inspect: branch diff against `origin/main`
   Action: confirm the diff contains representative runtime/type/docs coverage for the canonical `readModels` path.
   Expect: changed files include `src/__tests__/pipeline.test.ts`, `src/__tests__/query-listing.test.ts`, `src/__tests__/type-check.ts`, adapter read-model tests, `doc/domain-language.md`, and `llms.txt`.
3. Page: terminal in `/home/david/esther-w0`
   Inspect: issue planning, implementation tasks, and checkpoints
   Action: confirm the QA contract and implementation artifacts classify manual verification as not applicable for this library-only change.
   Expect: the plan says QA evidence is automated, implementation tasks say manual verification is not applicable, checkpoints `01` through `04` explicitly record manual verification as not applicable, and checkpoint `05` records full automated verification.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Full test gate | `review/findings/01-gate-results.md` / `bun run test` | 227 tests, 0 failures | passed | Required QA evidence from plan |
| Lint gate | `review/findings/01-gate-results.md` / `bun run lint` | ESLint + dependency-cruiser | passed | Required QA evidence from plan |
| Typecheck gate | `review/findings/01-gate-results.md` / `bun run typecheck` | `tsgo --noEmit -p tsconfig.json` | passed | Required QA evidence from plan |
| Runtime app wiring coverage | branch diff | `src/__tests__/pipeline.test.ts`, `src/__tests__/query-listing.test.ts` | files changed in diff | Covers canonical registration behavior |
| Public type-flow coverage | branch diff | `src/__tests__/type-check.ts` | file changed in diff | Covers exported registration types and factory destructuring |
| Adapter factory coverage | branch diff | in-memory and postgres read-model adapter tests | files changed in diff | Covers app-ready factory result shape |
| Docs/examples coverage | branch diff | `doc/domain-language.md`, `llms.txt` | files changed in diff | Covers representative migration guidance |

## Pass Criteria
- Full automated gate evidence exists and records `bun run test`, `bun run lint`, and `bun run typecheck` as passed.
- Representative runtime, type-level, adapter, and docs/example coverage is present in the branch diff.
- Issue artifacts consistently support that manual UI/CLI QA is not applicable for this library-only app-wiring change and that automated verification is the QA evidence path.

## Failure Capture
- failing step number
- exact artifact, command, or diff file under test
- expected result
- actual result
- repository path
- command output used as evidence
