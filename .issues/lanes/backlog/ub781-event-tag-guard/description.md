# Guard against DCB event tag mismatches

Source: current session

## Problem

Esther records DCB append preconditions from the tags read by `tagQuery(...)` / `castTagQuery(...)`, but it does not verify that the event being appended is tagged with the same consistency-relevant tags.

A command can read one boundary, pass the append precondition for that boundary, then append an event under a different tag set. That can make future reads miss the event and can make the DCB guard protect the wrong history.

## Current behavior

Example shape:

```txt
read tagQuery(["account:123"])
validate balance
append event tagged ["account:999"]
```

Current framework behavior:

- records observation for `account:123`
- passes `boundaryTags: ["account:123"]` to append
- does not require appended event to include `account:123`
- store checks only whether `account:123` history changed before append
- event can still be stored under `account:999`

This is likely always a user bug for commands whose decision depends on the read boundary, but the framework currently cannot tell.

## Why this matters

DCB correctness depends on stable tagging discipline. If tags drift between read side and append side:

- future `tagQuery(...)` reads may not see the event
- invariants may silently weaken
- concurrency checks may protect unrelated histories
- bugs look like DCB failure even though root cause is bad event tagging

This is especially risky because event tags are plain strings and tag construction often repeats between input descriptors and event builders.

## Desired outcome

Design guardrails that make tag mismatch harder.

Possible directions:

- Runtime assertion: if command observed a boundary, appended event must include all observed boundary tags.
- Opt-out API for advanced cases where read boundary and write tags intentionally differ.
- DSL helper to derive event tags from observed boundary tags instead of rebuilding strings.
- Test-only/dev-mode warning for mismatches.
- Docs/examples that show tag constants/helpers to avoid string drift.

## Constraints

- Some valid DCB designs may read a broader boundary and append narrower tags, or read one tag and append multiple tags. Guardrails must not forbid legitimate patterns without an escape hatch.
- Event tags are part of public event contract; migration needs care.
- Adapters should not own this policy. Core command execution has the context needed to compare observed boundary tags to event tags.

## Evidence / code paths

- `src/core/pipeline.ts` derives append options from the first boundary observation.
- `src/core/pipeline.ts` does not compare `observation.tags` with `parsedEvent.tags`.
- `EventRecordInput` in `src/core/types.ts` carries `tags` as plain `ReadonlyArray<string>`.

## Acceptance criteria

- Project decides whether tag mismatch should be error, warning, helper-only, or docs-only.
- If runtime guard is added, tests cover matching tags, missing observed tag, extra event tags, and intentional opt-out.
- Docs explain that append preconditions protect read tags; emitted events must be tagged so future reads include them.
