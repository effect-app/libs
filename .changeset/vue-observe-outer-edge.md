---
"@effect-app/vue": patch
---

Place `observeQueryAtom` at the outer edge of `withQueryOptions` so unmounting a query decrements observer count on the first teardown tick instead of cascading through `Atom.swr` and `recoverStuckWaitingOnMount` macrotasks.
