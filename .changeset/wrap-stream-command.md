---
"@effect-app/vue": minor
---

Add `wrapStream` support to `Command` with separate `result` and `running` props.

**Key design:**

- `result` is always the command's own execution outcome (from `asResult`)
- `running` holds the stream's live `AsyncResult` ref for progress tracking

**New behaviour:**

- `CommanderImpl.wrapStream(mutation)` returns a callable like `wrap` — `wrapStream(mutation)()` gives `CommandOut`.
- Accepts either `{ id, mutateStream: [...] }` or the augmented tuple directly (when `.id` is attached).
- `Command.wrap` now accepts `{ mutateStream, id }` and the augmented tuple — both delegate to `wrapStream`.
- `FnOptions.progress` — pass a `ComputedRef<AsyncResult>` to any `fn`-created command; surfaces as `running`.
- `StreamMutationWithExtensions` now includes `.id` on the tuple.
- Stream client entries expose `wrapStream` (callable), `fn`, and `mutateStream` (with `.id`).
- Stream mutation helpers also carry `.fn` and `.id`.

```ts
// Via client entry:
const exportCmd = Command.wrapStream(client.myExport)()
// exportCmd.result = own execution result; exportCmd.running = live stream AsyncResult

// Via mutateStream tuple (id is attached):
const exportCmd = Command.wrapStream(client.myExport.mutateStream)()

// wrap also accepts the tuple:
const exportCmd = Command.wrap(client.myExport.mutateStream)()

// fn with external progress:
const cmd = Command.fn({
  id: "myExport",
  progress: client.myExport.mutateStream[0]
})(
  function*(arg) {
    yield* client.myExport.mutateStream[1](arg)
  }
)
// cmd.running === the stream AsyncResult ref
```
