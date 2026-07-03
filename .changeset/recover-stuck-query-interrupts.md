---
"@effect-app/vue": patch
---

Recover interrupted queries and classify query-side suspense interrupts.

- A query fetch that is interrupted (a subscriber lost interest, a refresh superseded it, or the component navigated) can be left `waiting = true` with no fiber running — effect-core hides the interrupt by removing the result-observer before interrupting, so it is never written back. `isStaleResult`/swr short-circuit on `waiting`, so that state is never revalidated and becomes **terminal** (a cold suspense read throws → blank page; a warm one serves stale forever). `recoverStuckWaitingOnMount` now treats a `waiting` result with `inFlight === 0` as not-yet-fetched and refetches it on mount. Interrupts are **not** auto-retried — recovery only fires for a genuine (re)mounting observer, and a live in-flight fetch (`inFlight > 0`) is joined, not superseded. Concurrent mounts share a single recovery fetch. Exposes `queryFetchStates` / `QueryFetchState`.

- `useSuspenseQuery` / `useSuspenseQueryNew` now convert an interrupt-only failure that settles **while the component is still mounted** into a typed `SuspenseInterruptedError` (a `Data.TaggedError` carrying the original cause). Such an interrupt cannot be a navigation/unmount cancel — that path interrupts the suspense fiber itself and never yields a still-mounted `Failure` exit — so it is query-side (e.g. a server RPC interrupt `Exit` delivered over a 200). Error boundaries can render it ("the request was interrupted — reload?") instead of silencing it into a blank page, while continuing to silence genuine navigation interrupts. Adds `SuspenseInterruptedError` / `isSuspenseInterruptedError`.
