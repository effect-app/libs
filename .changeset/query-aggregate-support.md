---
"@effect-app/infra": minor
---

Add aggregate query support: `Q.aggregate(schema, aggregateMap)` performs GROUP BY + aggregate functions at the database level (Memory, SQL, Cosmos).

- New `agg` DSL namespace: `agg.field(path)` (group-by), `agg.count()`, `agg.countWhen(op)`, `agg.sum(field)`, `agg.min(field)`, `agg.max(field)`
- New `aggregate(schema, aggregateMap)` query operator replaces in-memory grouping with a single DB-level query
- Memory store: pure JS group-by + aggregation
- SQL store: `GROUP BY` + `COUNT(CASE WHEN ...)` / `SUM` / `MIN` / `MAX`
- Cosmos store: `GROUP BY` + `SUM(IIF(...))` for conditional counts
