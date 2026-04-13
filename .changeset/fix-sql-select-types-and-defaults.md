---
"@effect-app/infra": patch
---

Fix SQLite select query type coercion using `json_quote` and apply defaultValues in SQL WHERE clauses via `COALESCE`.
