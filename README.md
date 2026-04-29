# Esther

Esther is a TypeScript event-sourcing framework built around Dynamic Consistency Boundaries (DCB).

It uses append-only domain events, tag-based event queries, typed command/query operations, and declarative read models. Application code declares events, reducers, operations, projections, processors, and effects; adapters handle storage, transport, and side effects.

Core integrations include in-memory, filesystem, Postgres, Fastify, CLI, and React adapters.

For LLM-oriented API guidance, see [`llms.txt`](./llms.txt).
