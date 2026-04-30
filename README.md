# Esther

Esther is a TypeScript event-sourcing framework built around Dynamic Consistency Boundaries (DCB).

It uses append-only domain events, tag-based event queries, typed command/query operations, and declarative read models. Application code declares events, reducers, operations, projections, processors, and effects; adapters handle storage, transport, and side effects.

Core integrations include in-memory, filesystem, Postgres, Fastify, CLI, and React adapters.

## DCB in Esther

DCB is tag-based optimistic concurrency for command-side event-history reads. Command `tagQuery(...)` and `castTagQuery(...)` descriptors observe a tag boundary; append then checks that boundary has not changed before storing the command event. Projection/read-model reads such as `lookup(...)` are useful context, but they do not create append guards.

Read the short guide: [`doc/dcb.md`](./doc/dcb.md).

For LLM-oriented API guidance, see [`llms.txt`](./llms.txt).
