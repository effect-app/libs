---
"@effect-app/infra": patch
---

Strip `_etag` and `id` from the `data` JSON column in SQL store adapters (SQLite + PostgreSQL). These fields are already stored as dedicated columns and were redundantly duplicated inside the JSON blob. On read, `parseRow` now re-injects `id` from the row column. Backward compatible: existing rows with `_etag`/`id` in `data` continue to work as the column values take precedence.
