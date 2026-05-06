---
"@effect-app/vue": minor
"@effect-app/vue-components": minor
---

Add stream mutation support throughout the Vue commander pipeline.

- `asStreamResult` utility (mirrors `asResult`, accepts `Stream<A, E, R>` or a factory). Reactive ref updates with each emitted value (`waiting: true`) and finalises once the stream ends (`waiting: false`); errors surface as `AsyncResult.failure`.
- `clientFor` now exposes `mutateStream` for stream-type requests as a factory `(options?) => [resultRef, execute] & { id, running?, progress? }`. Always invoke `()` (optionally with `{ progress }`) to obtain a fresh ref+execute pair — independent invocations don't share state. Helpers expose the same shape under `xxxStream`.
- `Command.wrapStream(client.x)` and `Command.wrap(client.x)` build a CommanderWrap from a stream entry; the factory is called per command build.
- `Command.fn(client.x.mutateStream)` and `Command.fn(client.x.mutateStream({ progress }))` accept a stream factory or already-called tuple-with-id; the resulting command exposes `running` (live `AsyncResult`) and `progress` (formatted loading info) only when the factory was called with a `progress: (result) => Progress | undefined` formatter, where `Progress = string | { text: string; percentage: number }`.
- `CommandBase` adds `progress?: Progress` so the `CommandButton` component overrides the Vuetify `loader` slot with a `v-progress-circular` (using `model-value` for percentage when available, otherwise indeterminate) and the formatted text alongside.
- New example `examples/streamMutation.ts` shows modelling a long-running export operation that streams `OperationProgress | ExportComplete` events.
