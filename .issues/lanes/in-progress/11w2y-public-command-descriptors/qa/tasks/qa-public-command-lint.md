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
cli:
  needed:
    - install project dependencies if missing
    - run ESLint over source
    - run dependency-cruiser architecture checks
  covered:
    - bun install --frozen-lockfile
    - bun run lint
  missing:
    - none

## Goal
Prove public descriptor API changes, docs updates, and tests satisfy repository lint and architecture-boundary rules.

## Setup Notes
- Use issue branch checkout containing public command descriptor implementation and `llms.txt` updates.
- If dependencies are not installed, run `bun install --frozen-lockfile` first.
- No database, browser, fixture user, or persisted app state is required.
- `bun run lint` covers `bun run lint:code` and `bun run lint:deps` per `doc/commands.md`.

## Start
- URL: none — CLI-only repository check
- Page: none — terminal in repository root
- Device: desktop

## Steps
1. Page: terminal in repository root
   Locate: shell prompt at `/home/david/esther-w0`
   Action: Run `bun run lint`.
   Expect: Command exits `0` with no ESLint or dependency-cruiser failures.
2. Page: terminal output
   Locate: ESLint diagnostics, if any
   Action: Confirm no diagnostics reference `src/core/slice.ts`, `src/core/event.ts`, `src/index.ts`, or descriptor type tests.
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
| Public export/doc cleanup | `src/index.ts`, `llms.txt` | issue branch | No lint fallout from new exports/docs-adjacent tests | `llms.txt` itself is not linted but API tests are. |

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
