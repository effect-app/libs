---
"@effect-app/vue": minor
"@effect-app/vue-components": minor
---

- `CommandButton`: add optional `:map-progress` prop to compute progress from `command.result` via a custom mapper function
- `CommandBase`: add optional `result` field exposing reactive `AsyncResult` state
- Export `Progress` type from `@effect-app/vue`
- `streamFn`: pipe operators now receive the initial `Effect<Stream>` (or `Stream`) value unchanged; `Stream.unwrap` is deferred until after all combinators, enabling use of `withDefaultToast` and other Effect-level combinators
- Add `makeStreamMutation2`: like `makeStreamMutation` but returns `Effect<Stream>` per invocation (with invalidation via `Stream.ensuring`), for use with `streamFn` combinators
- Expose `streamFn` on `XClient.Y` stream handlers and on the `Command` object
- Expose `mutateStream2` on `XClient.Y` stream handlers, with a `wrapStream` helper that calls `streamFn` with the handler and provided combinators
