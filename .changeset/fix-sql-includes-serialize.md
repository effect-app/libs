---
"@effect-app/infra": patch
---

fix SQL includes-any/all double-quoting values for SQLite (JSON.stringify only needed for Postgres jsonb)
