---
"@effect-app/vue": minor
---

Add `asStreamResult` utility and stream-based mutation example.

`asStreamResult` mirrors `asResult` but accepts a `Stream<A, E, R>` (or a factory function that returns one). The reactive ref is updated with each emitted value (`waiting: true`) and finalised once the stream ends (`waiting: false`). Errors surface as `AsyncResult.failure`.

The included example (`examples/streamMutation.ts`) shows how to model a long-running export operation that streams `OperationProgress | ExportComplete` events into a readonly Vue ref.
