# Revisit compose and query APIs

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

Commands use `compose().add(...)` while queries use `state().pipe(...)`. Decide whether these are intentionally separate durable concepts or an implementation artifact, and either document the distinction or converge the APIs to reduce cognitive overhead.
