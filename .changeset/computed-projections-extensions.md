---
"@effect-app/infra": minor
---

Extend computed projections with additional relation operators:

- `relation(path).every(op)` — boolean, all elements match the filter (compiled as `NOT EXISTS(... WHERE NOT (filter))`).
- `relation(path).distinctCount(field, op?)` — distinct count of values at `field` within the relation.
- `relation(path).sum(field, op?)` — numeric sum over a relation field.
- `relation(path).collect(field, op?)` / `collectDistinct(field, op?)` — collect values into an array (with optional dedup).

All operators compile to native subqueries on SQL (sqlite/pg) and Cosmos, and to in-memory equivalents on the Memory store.
