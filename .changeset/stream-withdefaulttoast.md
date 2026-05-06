---
"@effect-app/vue": minor
"@effect-app/vue-components": patch
---

Add `Command.withDefaultToastStream` — a stream-aware combinator for `streamFn` that properly handles the full stream lifecycle (waiting/success/failure toasts). Unlike `withDefaultToast`, it waits for the stream to drain before showing the success toast and correctly handles stream errors.

Strongly type `CommandBase` with `RA`/`RE` type params for `result`, and update `CommandButton`'s `mapProgress` prop to be typed as `(result: AsyncResult<RA, RE>) => Progress | undefined`.
