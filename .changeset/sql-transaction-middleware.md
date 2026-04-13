---
"@effect-app/infra": minor
---

Make `withSqlTransaction` in `setupRequest` configurable via `withTransaction` option (defaults to `true`). Add `requiresTransactionConfig` and `makeSqlTransactionMiddleware` for per-RPC transaction control as a dynamic middleware that requires `SqlClient` directly.
