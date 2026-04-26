# Root export rollout note covers breaking change

status: pending
role: developer
browser_session: none
depends_on:
  - qa-removed-root-internals
mode: agent-executable-non-browser

## Goal
Verify the issue-local rollout note names every removed root export and gives supported migration alternatives without suggesting forbidden new subpaths.

## Setup Notes
- Run from repository root.
- Inspect `.issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md`.
- No browser, database, network service, or manual fixture setup required.

## Start
- URL: CLI repository root
- Page: terminal

## Steps
1. Page: terminal at repository root
   Inspect: rollout note removed export list
   Action: run `rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|Step|StepError|InlineResult" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md`
   Expect: output includes every removed root export name exactly in the rollout note.
2. Page: terminal at repository root
   Inspect: rollout note supported alternatives
   Action: run `rg -n "createApp\(\)\.dispatch|input adapters|read-interpreter and projection-store wiring|BoundaryObservation|BoundaryObservationError" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md`
   Expect: output includes alternatives for executor usage, interpreter/store wiring, and public boundary-observation error/details.
3. Page: terminal at repository root
   Inspect: forbidden subpath wording
   Action: run `rg -n "esther/(unstable|internal|adapter-kit)|unstable subpath|internal subpath|adapter-kit" .issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md || true`
   Expect: no output; rollout note does not suggest adding forbidden subpaths.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Removed export list | `release-notes/root-export-surface.md` section `## Removed root exports` | 12 planned removed names | All names present | Breaking API change communicated |
| Executor alternative | `release-notes/root-export-surface.md` section `## Supported alternatives` | `createApp().dispatch` / input adapters | Alternative present | Replaces `executeCommand` / `executeQuery` |
| Interpreter/store alternative | `release-notes/root-export-surface.md` section `## Supported alternatives` | `createApp()` owns wiring | Alternative present | Replaces direct interpreter/store construction |
| Boundary observation alternative | `release-notes/root-export-surface.md` section `## Supported alternatives` | `BoundaryObservation`, `BoundaryObservationError` | Alternative present | Replaces public `SliceDeps` naming |
| Forbidden subpaths | whole rollout note | `esther/unstable`, `esther/internal`, `esther/adapter-kit` | No matches | Plan forbids new subpath in this issue |

## Pass Criteria
- Rollout note names every removed root export.
- Rollout note gives all three supported alternatives from the plan.
- Forbidden subpath search returns no matches.

## Failure Capture
- failing step number
- command output
- missing removed export or migration alternative
- unexpected forbidden subpath line
- current git commit hash from `git rev-parse --short HEAD`
