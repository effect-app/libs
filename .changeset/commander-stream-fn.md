---
"@effect-app/vue": minor
---

Add `Command.streamFn` — a stream-backed variant of `Command.fn`.

The body generator (or plain function) returns a `Stream` instead of an `Effect`. The command's `waiting` state stays `true` while the stream is running and updates the reactive `result` ref for every emitted value.

Three handler shapes are accepted:

1. **Generator returning a Stream** (primary):
   ```ts
   Command.streamFn("exportData")(
     function*(arg, ctx) {
       const token = yield* getAuthToken
       return Stream.fromEffect(startExport(token, arg.id)).pipe(
         Stream.flatMap((job) => pollProgress(job.id))
       )
     }
   )
   ```
2. Function returning a `Stream` directly.
3. Function returning `Effect<Stream>` (unwrapped automatically).
