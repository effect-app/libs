---
"@effect-app/infra": patch
---

Stream resources accept `Effect.fail(...)` (and `Effect<Stream>`) from controller handlers — previously only `Stream.fail(...)` / a returned `Stream` worked. The router now lifts an Effect result to a Stream via `Stream.unwrap`, so failures from an `Effect` propagate as a failing Stream on the client, matching `Stream.fail(...)` behavior. Also removes the need for manual `.pipe(Stream.unwrap)` on generator handlers that return a `Stream`.
