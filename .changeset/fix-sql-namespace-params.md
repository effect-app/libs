---
"@effect-app/infra": patch
---

Fix SQLite store namespace parameter ordering in filter queries. The `_namespace` placeholder was prepended to the WHERE clause but its value was appended to the end of the positional params array, causing it to bind to the wrong placeholder. PostgreSQL was unaffected (uses indexed `$N` placeholders).
