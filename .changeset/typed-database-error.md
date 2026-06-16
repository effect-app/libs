---
"effect-app": minor
"@effect-app/infra": minor
---

Add a typed, serializable `DatabaseError { message, transient, cause }` for store adapter failures.

Store adapters wrapped DB calls in bare `Effect.promise` / `.orDie`, so a transient infra failure (request timeout, throttle, 5xx, dropped socket) became a raw-`Error` defect — which `Effect.retry` can't retry and which breaks JSON encoding of a workflow exit cause ("Expected JSON value, got Error"). `DatabaseError` is now exposed on all `Store` and `Repository` method error channels (writes: `OptimisticConcurrencyException | DatabaseError`) and added to `SupportedErrors` so the api/client/FE treat it as a 500-class error. Each adapter wraps its db-call failures into `DatabaseError` with a `transient` flag (timeout/throttle/5xx ⇒ retryable); the `cause` serializes via `Schema.Defect`. Construction/seed/DDL paths stay `orDie`.
