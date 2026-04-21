---
"@effect-app/infra": minor
---

Make `withSqlTransaction` in `setupRequest` configurable via `withTransaction` option (defaults to `false`). Add `requiresTransactionConfig` and `makeSqlTransactionMiddleware` for per-RPC transaction control as a dynamic middleware that requires `SqlClient` directly. Transactions are disabled by default; opt in with `withTransaction: true` or `requiresTransaction: true`.
