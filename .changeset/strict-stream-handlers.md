---
"@effect-app/infra": patch
---

Router handlers are now discriminated by `Resource[K]["stream"]`:

- Stream resources (`stream: true`) accept only `(req) => Stream<...>` handlers.
- Non-stream resources accept only `(req) => Effect<...>` (or generator yielding `Yieldable`).

Mixing — e.g. returning `Effect.fail(...)` or `Effect<Stream<...>>` from a stream handler — no longer type-checks.

The runtime `Stream.unwrap` branch that lifted `Effect`/`Effect<Stream>` returns into a `Stream` is removed; handlers for stream resources must return a `Stream` directly. Migrate `Effect.gen(...).pipe(Stream.unwrap)` patterns by returning the `Stream` directly, and convert `Effect.fail(err)` in stream handlers to `Stream.fail(err)`.
