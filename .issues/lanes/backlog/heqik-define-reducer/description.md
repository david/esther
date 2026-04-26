# Add defineReducer shared state helper

Source: current session

Add a strict `defineReducer` API for shared event-derived state reducers used across commands, queries, `castTagQuery`, read descriptors, and event-store tag queries.

Updated product decision: no compatibility. Public event-history query surfaces should require reducer definitions created by `defineReducer`; raw `schemas + fold` descriptor APIs should be removed rather than kept as alternate forms.
