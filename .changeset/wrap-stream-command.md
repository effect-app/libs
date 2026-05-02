---
"@effect-app/vue": minor
---

Add `wrapStream` support to Command. `CommanderImpl.wrapStream` creates a Command from a `mutateStream` tuple — the stream's reactive `AsyncResult` ref is used as the command's `result`, and the `label` is automatically augmented with `(completed/total)` progress info when the stream is waiting and the current value is an `OperationProgress`.

Stream client entries (e.g. `client.myAction`) now expose a pre-built `wrapStream` Command alongside `mutateStream`.
