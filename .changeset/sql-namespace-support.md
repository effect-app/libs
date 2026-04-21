---
"@effect-app/infra": minor
---

Add storage namespace support to SQL adapters (SQLite and Postgres) via a `_namespace` column. When `allowNamespace` is configured, a `_namespace` column with composite primary key `(id, _namespace)` isolates data per namespace within the same table. New tables get the schema automatically; existing tables require manual migration.
