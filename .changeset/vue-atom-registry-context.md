---
"@effect-app/vue": patch
---

Resolve `AtomRegistry.AtomRegistry` from Effect context in `invalidateSoft` and `invalidateAndAwait` (falling back to `defaultRegistry` when absent), and forward an optional `AtomRegistry` from `makeClient`'s base runtime context.
