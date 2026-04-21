---
"@effect-app/infra": patch
---

Repository `save`, `remove`, and `removeById` now accept plain `ReadonlyArray` instead of `NonEmptyReadonlyArray`. Callers no longer need to narrow or guard for non-emptiness before invoking — empty inputs short-circuit to a no-op, making it ergonomic to pass through query results directly.
