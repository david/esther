# Public command descriptor lint and dependency gates pass

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
ui:
  source:
    - none
  verified_against: none
  stale_risk: none — CLI-only lint/dependency check
cli:
  needed:
    - setup/install project dependencies when missing
    - assertion/run ESLint over source
    - assertion/run dependency-cruiser architecture checks
  covered:
    - bun install --frozen-lockfile
    - bun run lint
  missing:
    - none

## Goal
Prove public descriptor API changes, wrapper-safe `outputErr` helper, docs updates, and tests satisfy repository lint and architecture-boundary rules.

## Setup Notes
- Repository checkout: `/home/david/esther-w0` (source: current issue context and prior QA context).
- Dependencies: if `node_modules` is missing, run `bun install --frozen-lockfile` before the check (source: `doc/commands.md`).
- No database, browser, fixture user, persisted app state, route, or feature flag is required (source: `plan/01-implementation-plan.md` and `plan/02-wrapper-safe-outputerr-plan.md` QA contracts).
- `bun run lint` covers `bun run lint:code` and `bun run lint:deps` (source: `doc/commands.md`).
- Prior result/context at commit `c054514d12aeebfc6fa1f63ec7b230c4c7dd2b49` is superseded because wrapper-safe `outputErr` follow-up changed public API/docs/tests after that run (source: `qa/summary.md`, impl checkpoints 07–09).

## Start
- URL: none — CLI-only repository check
- Page: terminal in repository root
- Device: desktop

## Steps
1. Page: terminal in repository root
   Locate: shell prompt at `/home/david/esther-w0`
   Action: Run `bun run lint`.
   Expect: Command exits `0` with no ESLint or dependency-cruiser failures.
2. Page: terminal output
   Locate: ESLint diagnostics, if any
   Action: Confirm no diagnostics reference `src/core/slice.ts`, `src/core/event.ts`, `src/index.ts`, descriptor type tests, runtime tests, or `llms.txt`-adjacent docs examples.
   Expect: No code-style failures.
3. Page: terminal output
   Locate: dependency-cruiser diagnostics, if any
   Action: Confirm no dependency-boundary violations were introduced by root exports or core imports.
   Expect: No dependency violations.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| ESLint code gate | `bun run lint:code` via `bun run lint` | issue branch | No lint diagnostics | Covers TypeScript source and tests. |
| Dependency boundary gate | `bun run lint:deps` via `bun run lint` | issue branch | No dependency-cruiser violations | Core remains adapter-independent. |
| Public export/doc cleanup | `src/index.ts`, `llms.txt` | issue branch | No lint fallout from new exports/docs-adjacent tests | `llms.txt` itself is not linted; code examples are guarded by tests where applicable. |
| Cast policy containment | `src/core/slice.ts`, tests | issue branch | Lint does not flag unsafe or unused helper code | Bounded casts are reviewed in checkpoints/review. |

## Pass Criteria
- `bun run lint` exits `0`.
- ESLint reports no failures.
- Dependency-cruiser reports no boundary violations.

## Failure Capture
- failing step number
- exact lint or dependency-cruiser diagnostic
- file path and line/column when available
- command output from `bun run lint`
- current git commit hash
