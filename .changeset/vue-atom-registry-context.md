---
"effect-app": patch
"@effect-app/vue": patch
---

- `effect-app/runtime`: allow passing `{ memoMap }` to `makeAppRuntime`, `initializeSync`, and `initializeAsync` so apps can share `Atom.runtime`'s `Layer.MemoMap` (`defaultRegistry.get(Atom.runtime.memoMap)`) and avoid building duplicate contexts or `Reactivity` instances.
- `@effect-app/vue`: resolve `AtomRegistry.AtomRegistry` from Effect context in `invalidateSoft` and `invalidateAndAwait` (falling back to `defaultRegistry` when absent), and forward an optional `AtomRegistry` from `makeClient`'s base runtime context.
