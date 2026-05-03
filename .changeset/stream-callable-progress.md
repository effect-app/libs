---
"@effect-app/vue": minor
"@effect-app/vue-components": minor
---

Refine `mutateStream` shape and progress reporting.

- `mutateStream(options?)` now returns the `execute` callable directly, with `id`, `running?`, and `progress?` attached as properties. Tuple form `[ref, execute]` is gone — invoke the callable to run the stream, or pass it (or the factory) to `Command.fn` / `Command.wrap` / `Command.wrapStream`.
- `progress` formatter return type widened from `string | undefined` to `Progress | undefined`, where `Progress = string | { text: string; percentage: number }`.
- Stream failures now bubble through the execute effect's typed error channel `E` instead of being swallowed. The reactive `AsyncResult` ref still mirrors the failure for live progress UI.
- `CommandBase.progress?: Progress` replaces `progressText?: string`. `CommandButton` overrides the Vuetify `loader` slot when `progress` is set, rendering a `v-progress-circular` (bound to `model-value` when a `percentage` is supplied, otherwise `indeterminate`) alongside the formatted text.
- Factories and callables are branded with `_streamFactory` / `_streamCallable` so `Command.fn` / `Command.wrap` can disambiguate them from plain mutate functions.
