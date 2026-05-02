---
"@effect-app/vue": minor
---

Add `wrapStream` support to `Command` with a `running` prop exposing the live stream state.

**New behaviour:**
- `CommanderImpl.wrapStream(mutation)` now returns a callable like `wrap` — call it (optionally with combinators) to get the `CommandOut`.
- The command's `result` is driven by the stream's `AsyncResult` ref; the same ref is exposed as `running` for independent progress inspection.
- `Command.wrap` now accepts `{ mutateStream: [...], id }` and delegates to `wrapStream`.
- `FnOptions.progress` — pass a `ComputedRef<AsyncResult>` to any `fn`-created command and it is exposed as `running`.
- Stream client entries (e.g. `client.myAction`) now expose `wrapStream` (callable), `fn`, and `mutateStream`.
- Stream mutation helpers (`.helpers.myActionStream`) now also carry a `.fn` property.

```ts
// Callable like wrap:
const exportCmd = Command.wrapStream(client.myExport)()
// exportCmd.running reflects the live stream state

// With a combinator:
const exportCmd = Command.wrapStream(client.myExport)(CommanderStatic.withDefaultToast())

// Via pre-built client entry:
const { running, waiting, handle } = client.myExport.wrapStream()

// fn with external progress:
const [running, execute] = client.myExport.mutateStream
const cmd = Command.fn({ id: "myExport", progress: running })(function*(arg) {
  yield* execute(arg)
})
// cmd.running === running (live stream state)
```
