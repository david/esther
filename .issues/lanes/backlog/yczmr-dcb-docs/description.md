# Clarify DCB docs and examples

Source: current session

## Problem

A user familiar with this library still reported not understanding DCB clearly. Current docs define Dynamic Consistency Boundary as "consistency is defined by the set of tags read during state resolution," but the practical rules and sharp edges are not obvious enough.

The library has a sane minimal DCB implementation, but users can easily misuse it by choosing the wrong tags, relying on projection-only reads, assuming aggregate-like semantics, or missing current implementation limits.

## Current behavior to explain

Plain-language model:

```txt
DCB = lock what you read, using tags, with optimistic append check.
```

Esther flow:

```txt
tagQuery/castTagQuery
  -> eventStore.queryByTags(tags, reducer)
  -> state + maxPosition
  -> command validates
  -> append(event, { boundaryTags: tags, expectedPosition: maxPosition })
  -> append fails if that tag boundary changed
```

Key current limits to document:

- Only `tagQuery(...)` and `castTagQuery(...)` create DCB append guards.
- `lookup(...)` / projection reads do not create DCB append guards.
- Commands currently support only one observed event-history boundary.
- Framework does not verify appended event tags match observed boundary tags.
- User must choose tags that cover every event capable of invalidating the command decision.
- Tag queries use intersection semantics: events must contain all queried tags.
- `[]` / `undefined` boundary means global stream.

## Why this matters

If users misunderstand DCB, they may write commands that look event-sourced but are not concurrency-safe.

Example bad mental model:

```txt
I read some state, so Esther protects me.
```

Correct mental model:

```txt
Only event histories read through DCB-aware descriptors are protected.
Protection covers exactly the queried tag boundary.
```

Docs should help users answer:

```txt
What exact prior events could make this command decision wrong?
What tag set includes those events?
Does command read that tag set before append?
Will appended event be visible to future reads of that tag set?
```

## Desired outcome

Add a concise DCB guide and update canonical docs/examples so DCB is teachable in minutes.

Possible additions:

- `doc/domain-language.md`: expand DCB definition with tiny example.
- `llms.txt`: include DCB quick rules and sharp edges.
- README or docs: add "DCB in Esther" section with code snippets.
- Example command: account withdraw or username claim showing correct `tagQuery(...)` usage.
- Counterexamples: projection-only lookup, wrong event tags, too-narrow intersection tags.

## Constraints

- Keep docs accurate to current implementation; do not imply multi-boundary support until implemented.
- Keep examples small and concrete.
- If public API / DSL behavior docs change, keep `llms.txt` current.

## Acceptance criteria

- A new user can explain DCB as tag-based optimistic concurrency after reading one short section.
- Docs clearly distinguish event-history reads from projection reads.
- Current implementation limits are explicit, not buried.
- Examples show both correct usage and at least one common misuse.
