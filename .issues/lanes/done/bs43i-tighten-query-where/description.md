# Tighten read-model query where typing

Source: current session; [proposed-improvements.md](../../../references/proposed-improvements.md)

`Where<T>` currently accepts clauses for every field type in `T`, including object and array fields. Runtime `normalizeWhere(...)` only emits concrete `WhereEntry` values for primitive equality (`string | number | boolean`), numeric/string ranges, and primitive `in` clauses. Unsupported clauses can be silently dropped, creating a type/runtime mismatch where code type-checks but produces broader-than-intended queries.

Fix should make unsupported query clauses impossible or explicit. Prefer narrowing queryable fields/clauses at the type level and adding runtime guard/error coverage for any remaining unsupported descriptor shapes.
