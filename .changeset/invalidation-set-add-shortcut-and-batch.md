---
"effect-app": patch
---

`InvalidationSet.add` accepts arrays and is exposed as a static shortcut.

- Single item: `yield* InvalidationSet.add(UserRsc.GetMe)`
- Batch: `yield* InvalidationSet.add([UserRsc.GetMe, ["custom", "key"]])`
- Skips the `.use(_ => _.add(...))` boilerplate.

Existing `InvalidationSet.use(_ => _.add(...))` form still works; the service
identity is preserved via `Object.assign` so `Effect.provideService` and
`.use` / `.useSync` continue to operate on the same `Context.Reference`.
