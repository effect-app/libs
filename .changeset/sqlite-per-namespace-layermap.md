---
"@effect-app/infra": minor
---

Add per-namespace in-memory SQLite adapter via LayerMap. When `makeSqlClientLayer` option is provided to `SQLiteStoreLayer`, each namespace gets its own SQLite database instance managed by a `LayerMap`. Introduces `WithNsTransaction` service for namespace-aware SQL transactions, used by `makeSqlTransactionMiddleware`.
