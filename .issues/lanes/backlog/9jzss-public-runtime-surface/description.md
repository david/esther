# Narrow public runtime surface

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

`src/index.ts` exports several low-level pipeline/runtime types that may be internal implementation plumbing rather than stable public API. Review the public exports and hide or mark unstable runtime internals before external users depend on them.
