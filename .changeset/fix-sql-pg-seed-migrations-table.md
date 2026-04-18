---
"@effect-app/infra": patch
---

SQL and Pg stores: use separate `_migrations` table for seed tracking instead of inserting a marker row into the data table, preventing it from appearing in `all`/`filter` queries.
