---
"@effect-app/infra": patch
---

Fix SQL `IN`/`NOT IN` with null values to use `IS NULL`/`IS NOT NULL` instead of `IN (NULL, ...)`.
