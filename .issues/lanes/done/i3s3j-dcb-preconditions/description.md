# Thread DCB observations into append preconditions

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

Command-side event-history reads such as `tagQuery(...)` and `castTagQuery(...)` return boundary information, but the framework pipeline does not currently retain those observations or pass derived `boundaryTags`/`expectedPosition` preconditions into `eventStore.append(...)`. Implement end-to-end DCB enforcement so commands that validate against event history fail on stale concurrent writes.
