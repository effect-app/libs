---
"@effect-app/vue": patch
---

Delay the in-progress (waiting) toast by 1 second in `withToast` and `withDefaultToastStream`. Fast operations that produce a success/failure (or, for streams, a progress event or terminal state) within the delay window never show a waiting toast at all. Any subsequent waiting/progress/success/failure toast aborts the pending delayed toast so it never flashes after the terminal state.
